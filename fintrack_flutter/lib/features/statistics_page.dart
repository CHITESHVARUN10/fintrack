import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/spending_statistics.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/spending_breakdown.dart';
import '../widgets/spending_trend.dart';
import '../widgets/states.dart';

const _monoFallback = <String>[FinStackType.body];

class StatisticsPage extends StatefulWidget {
  const StatisticsPage({super.key, this.refresh = 0});
  final int refresh;

  @override
  State<StatisticsPage> createState() => _StatisticsPageState();
}

class _StatisticsPageState extends State<StatisticsPage> {
  var _period = SpendingPeriod.month;
  var _now = DateTime.now();
  late var _month = DateTime(_now.year, _now.month);
  DateTimeRange? _custom;
  var _byVendor = false;
  var _showAllChanges = false;
  String? _category;
  String? _vendor;
  String? _error;
  CancelToken? _request;
  SpendingStatistics? _data;
  SpendingView? _view;

  ({DateTimeRange current, DateTimeRange previous}) get _ranges =>
      spendingRanges(
        period: _period,
        now: _now,
        month: _month,
        custom: _custom,
      );

  DateTime get _firstDate => DateTime(1900);
  DateTime get _lastDate => DateTime(_now.year + 10, 12, 31);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant StatisticsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.refresh != oldWidget.refresh) _load();
  }

  @override
  void dispose() {
    _request?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    _request?.cancel();
    final request = _request = CancelToken();
    setState(() {
      _now = DateTime.now();
      _error = null;
      _data = null;
      _view = null;
      _showAllChanges = false;
    });
    final ranges = _ranges;
    try {
      final data = await SpendingStatistics.load(ranges, request);
      if (!mounted || request.isCancelled) return;
      setState(() {
        _data = data;
        _updateView();
      });
    } catch (error) {
      if (!mounted || request.isCancelled) return;
      final response = error is DioException ? error.response : null;
      final message = response?.data;
      setState(() {
        _error =
            response?.statusCode == 400 &&
                message is Map &&
                message['error'] == 'Join or create a family first'
            ? 'Create or join a family to start recording spending.'
            : 'Could not load spending. Check your connection and try again.';
      });
    }
  }

  void _updateView() {
    _showAllChanges = false;
    _view = _data?.filter(
      range: _ranges.current,
      category: _category,
      vendor: _vendor,
    );
  }

  void _selectPeriod(SpendingPeriod period) {
    if (period == SpendingPeriod.custom) {
      _pickDates();
      return;
    }
    final now = DateTime.now();
    setState(() {
      _period = period;
      _month = DateTime(now.year, now.month);
    });
    _load();
  }

  void _moveMonth(int offset) {
    setState(() {
      _period = SpendingPeriod.month;
      _month = DateTime(_month.year, _month.month + offset);
    });
    _load();
  }

  Future<void> _pickDates() async {
    final selected = await showModalBottomSheet<DateTimeRange>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _DateRangeSheet(
        initial: _custom ?? _ranges.current,
        firstDate: _firstDate,
        lastDate: _lastDate,
      ),
    );
    if (!mounted || selected == null) return;
    setState(() {
      _custom = selected;
      _period = SpendingPeriod.custom;
    });
    _load();
  }

  Future<void> _pickFilter({required bool byVendor}) async {
    final options = _data?.options(byVendor: byVendor);
    if (options == null) return;
    final selected = byVendor ? _vendor : _category;
    final result = await showModalBottomSheet<({String? value})>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => _SpendingFilterSheet(
        title: byVendor ? 'Vendor' : 'Category',
        options: {...options, ?selected}.toList(),
        selected: selected,
      ),
    );
    if (!mounted || result == null) return;
    setState(() {
      if (byVendor) {
        _vendor = result.value;
      } else {
        _category = result.value;
      }
      _updateView();
    });
  }

  void _clearFilters() {
    setState(() {
      _category = null;
      _vendor = null;
      _updateView();
    });
  }

  @override
  Widget build(BuildContext context) {
    final ranges = _ranges;
    final view = _view;
    final filterActive = _category != null || _vendor != null;
    final upcoming = ranges.current.start.isAfter(_now) && view?.count == 0;
    return RefreshIndicator(
      onRefresh: _load,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final side = math.max(14.0, (constraints.maxWidth - 720) / 2);
          return ListView(
            padding: EdgeInsets.fromLTRB(side, 14, side, 28),
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              _filtersCard(ranges.current, filterActive),
              const SizedBox(height: 14),
              if (_error case final String message)
                BrutalEmpty(
                  icon: Icons.info_outline,
                  message: message,
                  action: _action('Retry', _load),
                )
              else if (view == null)
                _loadingCard()
              else ...[
                SpendingTrend(
                  key: ValueKey((
                    _ranges.current.start,
                    _ranges.current.end,
                    _category,
                    _vendor,
                  )),
                  view: view,
                  previousRange: upcoming ? null : ranges.previous,
                ),
                if (view.count == 0) ...[
                  const SizedBox(height: 14),
                  BrutalEmpty(
                    icon: Icons.bar_chart,
                    message: filterActive
                        ? 'No spending matches these filters in this period.'
                        : upcoming
                        ? 'No spending recorded yet for this upcoming period.'
                        : 'No spending recorded for this period.',
                    action: filterActive
                        ? _action('Clear filters', _clearFilters)
                        : _period == SpendingPeriod.month &&
                              _month.isAfter(_firstDate)
                        ? _action('View previous month', () => _moveMonth(-1))
                        : null,
                  ),
                ],
                if (!upcoming &&
                    (view.currentPaise > 0 || view.previousPaise > 0)) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: _SegButton(
                          label: 'By category',
                          selected: !_byVendor,
                          onPressed: () => _selectBreakdown(false),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _SegButton(
                          label: 'By vendor',
                          selected: _byVendor,
                          onPressed: () => _selectBreakdown(true),
                        ),
                      ),
                    ],
                  ),
                  if (view.count > 0) ...[
                    const SizedBox(height: 14),
                    SpendingBreakdown(
                      key: ValueKey(_byVendor),
                      title: _byVendor
                          ? 'Vendor breakdown'
                          : 'Category breakdown',
                      subtitle: 'Share of spending in this period',
                      formatAmount: (amount) =>
                          spendingInr((amount * 100).round()),
                      emptyMessage: 'No spending in this period.',
                      entries: view.breakdown(byVendor: _byVendor),
                      accent: _byVendor
                          ? FinStackColors.accentTeal
                          : FinStackColors.accentPurple,
                    ),
                  ],
                  const SizedBox(height: 14),
                  SpendingChanges(
                    changes: view.changes(byVendor: _byVendor),
                    byVendor: _byVendor,
                    previousRange: ranges.previous,
                    showAll: _showAllChanges,
                    onToggle: () =>
                        setState(() => _showAllChanges = !_showAllChanges),
                  ),
                ],
              ],
            ],
          );
        },
      ),
    );
  }

  void _selectBreakdown(bool byVendor) {
    setState(() {
      _byVendor = byVendor;
      _showAllChanges = false;
    });
  }

  Widget _filtersCard(DateTimeRange current, bool filterActive) {
    final monthMode = _period == SpendingPeriod.month;
    final title = switch (_period) {
      SpendingPeriod.month => MaterialLocalizations.of(
        context,
      ).formatMonthYear(_month),
      SpendingPeriod.today => 'Today',
      SpendingPeriod.custom => 'Custom period',
    };
    return BrutalCard(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _DurationPill(
                label: 'Today',
                selected: _period == SpendingPeriod.today,
                onPressed: () => _selectPeriod(SpendingPeriod.today),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DurationPill(
                  label: 'This month',
                  selected:
                      _period == SpendingPeriod.month &&
                      _month.month == _now.month &&
                      _month.year == _now.year,
                  onPressed: () => _selectPeriod(SpendingPeriod.month),
                ),
              ),
              const SizedBox(width: 8),
              _DurationPill(
                label: 'Custom dates',
                selected: _period == SpendingPeriod.custom,
                onPressed: () => _selectPeriod(SpendingPeriod.custom),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: FinStackColors.onSurface.withValues(alpha: .16),
                  width: 1.5,
                ),
              ),
            ),
            child: Row(
              children: [
                if (monthMode)
                  _MonthArrow(
                    tooltip: 'Previous month',
                    icon: Icons.chevron_left,
                    onPressed: _month.isAfter(_firstDate)
                        ? () => _moveMonth(-1)
                        : null,
                  )
                else
                  const SizedBox(width: 44, height: 44),
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: FinStackType.display,
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        spendingDateRange(current),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: FinStackType.mono,
                          fontFamilyFallback: _monoFallback,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: FinStackColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (monthMode)
                  _MonthArrow(
                    tooltip: 'Next month',
                    icon: Icons.chevron_right,
                    onPressed: _month.isBefore(DateTime(_lastDate.year, 12))
                        ? () => _moveMonth(1)
                        : null,
                  )
                else
                  const SizedBox(width: 44, height: 44),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _FilterTrigger(
                  label: _category ?? 'All categories',
                  semanticsLabel: _category == null
                      ? 'Category filter, all categories'
                      : 'Category filter, $_category',
                  onPressed: _data == null
                      ? null
                      : () => _pickFilter(byVendor: false),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _FilterTrigger(
                  label: _vendor ?? 'All vendors',
                  semanticsLabel: _vendor == null
                      ? 'Vendor filter, all vendors'
                      : 'Vendor filter, $_vendor',
                  onPressed: _data == null
                      ? null
                      : () => _pickFilter(byVendor: true),
                ),
              ),
              if (filterActive) ...[
                const SizedBox(width: 8),
                _ClearFilters(onPressed: _clearFilters),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _action(String label, VoidCallback onPressed) => OutlinedButton(
    onPressed: onPressed,
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(0, 44),
      textStyle: const TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: .4,
      ),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      side: BorderSide(color: FinStackColors.onSurface, width: 2),
      backgroundColor: FinStackColors.surface,
    ),
    child: Text(label.toUpperCase()),
  );

  Widget _loadingCard() => const BrutalCard(
    padding: EdgeInsets.all(15),
    child: Row(
      children: [
        SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            semanticsLabel: 'Loading spending',
          ),
        ),
        SizedBox(width: 10),
        Text(
          'LOADING SPENDING',
          style: TextStyle(
            fontFamily: FinStackType.mono,
            fontFamilyFallback: _monoFallback,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: .7,
          ),
        ),
      ],
    ),
  );
}

class _DurationPill extends StatelessWidget {
  const _DurationPill({
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: AnimatedContainer(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 120),
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? FinStackColors.accentSurface
                : FinStackColors.surface,
            border: Border.all(color: FinStackColors.onSurface, width: 2.5),
            boxShadow: [
              BoxShadow(
                color: FinStackColors.shadow,
                offset: Offset(2, 2),
                blurRadius: 0,
              ),
            ],
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: FinStackType.display,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: FinStackColors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _MonthArrow extends StatelessWidget {
  const _MonthArrow({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: tooltip,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: GestureDetector(
              onTap: onPressed,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: FinStackColors.surfaceContainer,
                  border: Border.all(
                    color: enabled
                        ? FinStackColors.onSurface
                        : FinStackColors.onSurface.withValues(alpha: .35),
                    width: 2,
                  ),
                ),
                child: Icon(
                  icon,
                  size: 18,
                  color: enabled
                      ? FinStackColors.onSurface
                      : FinStackColors.onSurface.withValues(alpha: .35),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterTrigger extends StatelessWidget {
  const _FilterTrigger({
    required this.label,
    required this.semanticsLabel,
    required this.onPressed,
  });

  final String label;
  final String semanticsLabel;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticsLabel,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: FinStackColors.surfaceLow,
            border: Border.all(
              color: enabled
                  ? FinStackColors.onSurface
                  : FinStackColors.onSurface.withValues(alpha: .4),
              width: 2,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                    color: enabled
                        ? FinStackColors.onSurface
                        : FinStackColors.onSurface.withValues(alpha: .45),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.expand_more,
                size: 16,
                color: enabled
                    ? FinStackColors.onSurface
                    : FinStackColors.onSurface.withValues(alpha: .45),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClearFilters extends StatelessWidget {
  const _ClearFilters({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Clear filters',
      child: Semantics(
        button: true,
        label: 'Clear filters',
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: GestureDetector(
              onTap: onPressed,
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: FinStackColors.surfaceContainer,
                  border: Border.all(color: FinStackColors.onSurface, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: FinStackColors.shadow,
                      offset: Offset(2, 2),
                      blurRadius: 0,
                    ),
                  ],
                ),
                child: const Icon(Icons.filter_alt_off_outlined, size: 17),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SegButton extends StatelessWidget {
  const _SegButton({
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: AnimatedContainer(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 120),
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          decoration: BoxDecoration(
            color: selected
                ? FinStackColors.accentSurface
                : FinStackColors.surface,
            border: Border.all(color: FinStackColors.onSurface, width: 2.5),
            boxShadow: [
              BoxShadow(
                color: FinStackColors.shadow,
                offset: Offset(3, 3),
                blurRadius: 0,
              ),
            ],
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: FinStackType.display,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _SpendingFilterSheet extends StatefulWidget {
  const _SpendingFilterSheet({
    required this.title,
    required this.options,
    required this.selected,
  });

  final String title;
  final List<String> options;
  final String? selected;

  @override
  State<_SpendingFilterSheet> createState() => _SpendingFilterSheetState();
}

class _SpendingFilterSheetState extends State<_SpendingFilterSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final options = widget.options
        .where((label) => label.toLowerCase().contains(_query))
        .toList();
    final all = widget.title == 'Category' ? 'All categories' : 'All vendors';
    final search = widget.title == 'Category'
        ? 'Search categories'
        : 'Search vendors';
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: FractionallySizedBox(
          heightFactor: .72,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            widget.title,
                            style: const TextStyle(
                              fontFamily: FinStackType.display,
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        BrutalIconButton(
                          icon: Icons.close,
                          tooltip: 'Close',
                          color: FinStackColors.surface,
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: search,
                        prefixIcon: const Icon(Icons.search, size: 18),
                      ),
                      onChanged: (query) =>
                          setState(() => _query = query.trim().toLowerCase()),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(8, 0, 8, 18),
                  itemCount: _query.isEmpty
                      ? options.length + 1
                      : math.max(options.length, 1),
                  itemBuilder: (context, index) {
                    if (_query.isNotEmpty && options.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No matches'),
                      );
                    }
                    final String? value = _query.isEmpty
                        ? (index == 0 ? null : options[index - 1])
                        : options[index];
                    final selected = value == widget.selected;
                    return _PickerRow(
                      label: value ?? all,
                      selected: selected,
                      onTap: () => Navigator.pop(context, (value: value)),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? FinStackColors.surfaceContainer : null,
            border: Border(
              bottom: BorderSide(
                color: FinStackColors.onSurface.withValues(alpha: .14),
              ),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ),
              if (selected) const Icon(Icons.check, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _DateRangeSheet extends StatefulWidget {
  const _DateRangeSheet({
    required this.initial,
    required this.firstDate,
    required this.lastDate,
  });

  final DateTimeRange initial;
  final DateTime firstDate;
  final DateTime lastDate;

  @override
  State<_DateRangeSheet> createState() => _DateRangeSheetState();
}

class _DateRangeSheetState extends State<_DateRangeSheet> {
  late DateTime _start = DateUtils.dateOnly(widget.initial.start);
  late DateTime _end = DateUtils.dateOnly(widget.initial.end);
  late DateTime _view = DateTime(_start.year, _start.month);
  var _selectingEnd = false;

  bool get _canGoBack => DateTime(
    _view.year,
    _view.month,
  ).isAfter(DateTime(widget.firstDate.year, widget.firstDate.month));

  bool get _canGoForward => DateTime(
    _view.year,
    _view.month,
  ).isBefore(DateTime(widget.lastDate.year, widget.lastDate.month));

  void _select(DateTime day) {
    final date = DateUtils.dateOnly(day);
    setState(() {
      if (!_selectingEnd) {
        _start = date;
        _end = date;
        _selectingEnd = true;
      } else if (date.isBefore(_start)) {
        _start = date;
        _selectingEnd = false;
      } else {
        _end = date;
        _selectingEnd = false;
      }
    });
  }

  void _shiftMonth(int offset) {
    setState(() => _view = DateTime(_view.year, _view.month + offset));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.sizeOf(context).height * .9,
      color: FinStackColors.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              decoration: BoxDecoration(
                color: FinStackColors.surfaceContainer,
                border: Border(
                  bottom: BorderSide(
                    color: FinStackColors.onSurface,
                    width: 2.5,
                  ),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      BrutalIconButton(
                        icon: Icons.close,
                        tooltip: 'Close date picker',
                        color: FinStackColors.surface,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const Spacer(),
                      _ApplyDatesButton(
                        onPressed: () => Navigator.of(
                          context,
                        ).pop(DateTimeRange(start: _start, end: _end)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Choose spending dates',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: FinStackColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${shortDateLabel(_start)} – ${shortDateLabel(_end)}',
                    style: const TextStyle(
                      fontFamily: FinStackType.display,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: FinStackColors.surfaceLow,
                border: Border(
                  bottom: BorderSide(color: FinStackColors.onSurface, width: 2),
                ),
              ),
              child: Row(
                children: [
                  for (final day in const ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
                    Expanded(
                      child: Text(
                        day,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: FinStackType.mono,
                          fontFamilyFallback: _monoFallback,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 14, 12, 32),
                children: [
                  Row(
                    children: [
                      _CalendarArrow(
                        icon: Icons.chevron_left,
                        tooltip: 'Previous calendar month',
                        onPressed: _canGoBack ? () => _shiftMonth(-1) : null,
                      ),
                      Expanded(
                        child: Text(
                          MaterialLocalizations.of(
                            context,
                          ).formatMonthYear(_view),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontFamily: FinStackType.display,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      _CalendarArrow(
                        icon: Icons.chevron_right,
                        tooltip: 'Next calendar month',
                        onPressed: _canGoForward ? () => _shiftMonth(1) : null,
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _MonthGrid(
                    month: _view,
                    start: _start,
                    end: _end,
                    onSelected: _select,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ApplyDatesButton extends StatelessWidget {
  const _ApplyDatesButton({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Apply dates',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: FinStackColors.accentSurface,
            border: Border.all(color: FinStackColors.onSurface, width: 2),
            boxShadow: [
              BoxShadow(
                color: FinStackColors.shadow,
                offset: Offset(2, 2),
                blurRadius: 0,
              ),
            ],
          ),
          child: const Text(
            'Apply dates',
            style: TextStyle(
              fontFamily: FinStackType.display,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: .4,
            ),
          ),
        ),
      ),
    );
  }
}

class _CalendarArrow extends StatelessWidget {
  const _CalendarArrow({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: tooltip,
        child: IconButton(
          onPressed: onPressed,
          iconSize: 18,
          style: IconButton.styleFrom(
            backgroundColor: FinStackColors.surfaceLow,
            side: BorderSide(
              color: enabled
                  ? FinStackColors.onSurface
                  : FinStackColors.onSurface.withValues(alpha: .35),
              width: 2,
            ),
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.zero,
            ),
            minimumSize: const Size(36, 36),
            padding: EdgeInsets.zero,
          ),
          icon: Icon(icon),
        ),
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.start,
    required this.end,
    required this.onSelected,
  });

  final DateTime month;
  final DateTime start;
  final DateTime end;
  final ValueChanged<DateTime> onSelected;

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month);
    final days = DateTime(month.year, month.month + 1, 0).day;
    final leading = first.weekday % 7;
    final rows = ((leading + days) / 7).ceil();
    return Column(
      children: [
        for (var row = 0; row < rows; row++)
          Row(
            children: [
              for (var column = 0; column < 7; column++)
                Expanded(
                  child: _CalendarDay(
                    date: row * 7 + column - leading + 1,
                    month: month,
                    days: days,
                    start: start,
                    end: end,
                    onSelected: onSelected,
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

class _CalendarDay extends StatelessWidget {
  const _CalendarDay({
    required this.date,
    required this.month,
    required this.days,
    required this.start,
    required this.end,
    required this.onSelected,
  });

  final int date;
  final DateTime month;
  final int days;
  final DateTime start;
  final DateTime end;
  final ValueChanged<DateTime> onSelected;

  @override
  Widget build(BuildContext context) {
    if (date < 1 || date > days) return const SizedBox(height: 38);
    final day = DateTime(month.year, month.month, date);
    final inRange = !day.isBefore(start) && !day.isAfter(end);
    final edge = day == start || day == end;
    return Semantics(
      button: true,
      selected: inRange,
      label: dateLabel(day),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => onSelected(day),
        child: SizedBox(
          height: 38,
          child: Center(
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: edge
                    ? FinStackColors.onSurface
                    : inRange
                    ? FinStackColors.tertiary
                    : null,
                shape: edge ? BoxShape.circle : BoxShape.rectangle,
              ),
              child: Text(
                '$date',
                style: TextStyle(
                  fontFamily: FinStackType.mono,
                  fontFamilyFallback: _monoFallback,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: edge ? Colors.white : FinStackColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SpendingChanges extends StatelessWidget {
  const SpendingChanges({
    super.key,
    required this.changes,
    required this.byVendor,
    required this.previousRange,
    required this.showAll,
    required this.onToggle,
  });

  static const _previousColor = Color(0xFF7B7465);
  static TextStyle get _amountStyle => TextStyle(
    fontFamily: FinStackType.mono,
    fontFamilyFallback: _monoFallback,
    fontSize: 12,
    letterSpacing: 0,
    fontWeight: FontWeight.w700,
    color: FinStackColors.onSurface,
  );

  final List<SpendingChange> changes;
  final bool byVendor;
  final DateTimeRange previousRange;
  final bool showAll;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final maxAmount = changes.fold<int>(
      1,
      (max, row) => math.max(max, math.max(row.current, row.previous)),
    );
    final visible = showAll ? changes : changes.take(5).toList();
    final painter = TextPainter(
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: 1,
    );
    var amountWidth = 0.0;
    for (final change in visible) {
      for (final amount in [change.current, change.previous]) {
        painter.text = TextSpan(text: spendingInr(amount), style: _amountStyle);
        painter.layout();
        amountWidth = math.max(amountWidth, painter.width.ceilToDouble() + 2);
      }
    }
    painter.dispose();
    return BrutalCard(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BrutalSectionTitle(
            title: byVendor ? 'Changes by vendor' : 'Changes by category',
            subtitle: 'Compared with ${spendingDateRange(previousRange)}',
            accent: FinStackColors.accentOrange,
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: FinStackColors.onSurface.withValues(alpha: .16),
                  width: 1.5,
                ),
              ),
            ),
            child: const Wrap(
              spacing: 14,
              runSpacing: 6,
              children: [
                SpendingChartKey(
                  color: FinStackColors.accentPurple,
                  label: 'Selected period',
                ),
                SpendingChartKey(
                  color: _previousColor,
                  label: 'Previous period',
                ),
              ],
            ),
          ),
          LayoutBuilder(
            builder: (context, constraints) {
              // Keep one plot width for every category, even when the exact
              // amounts use different numbers of digits.
              final amountsAboveBars = constraints.maxWidth - amountWidth < 112;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (index, change) in visible.indexed)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        border: index == visible.length - 1
                            ? null
                            : Border(
                                bottom: BorderSide(
                                  color: FinStackColors.chartGrid,
                                ),
                              ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            change.label,
                            style: const TextStyle(
                              fontFamily: FinStackType.display,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            spendingDelta(change.current, change.previous),
                            style: TextStyle(
                              fontFamily: FinStackType.mono,
                              fontFamilyFallback: _monoFallback,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: FinStackColors.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 10),
                          _ComparisonBar(
                            label: 'Selected period',
                            value: change.current,
                            max: maxAmount,
                            color: FinStackColors.accentPurple,
                            amountStyle: _amountStyle,
                            amountWidth: amountWidth,
                            amountAboveBar: amountsAboveBars,
                          ),
                          const SizedBox(height: 6),
                          _ComparisonBar(
                            label: 'Previous period',
                            value: change.previous,
                            max: maxAmount,
                            color: _previousColor,
                            amountStyle: _amountStyle.copyWith(
                              color: FinStackColors.onSurfaceVariant,
                            ),
                            amountWidth: amountWidth,
                            amountAboveBar: amountsAboveBars,
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
          if (changes.length > 5) ...[
            const SizedBox(height: 12),
            BrutalButton(
              block: true,
              color: FinStackColors.surface,
              label: showAll ? 'Show top 5' : 'Show all ${changes.length}',
              onPressed: onToggle,
            ),
          ],
        ],
      ),
    );
  }
}

class _ComparisonBar extends StatelessWidget {
  const _ComparisonBar({
    required this.label,
    required this.value,
    required this.max,
    required this.color,
    required this.amountStyle,
    required this.amountWidth,
    required this.amountAboveBar,
  });

  final String label;
  final int value;
  final int max;
  final Color color;
  final TextStyle amountStyle;
  final double amountWidth;
  final bool amountAboveBar;

  @override
  Widget build(BuildContext context) {
    final formatted = spendingInr(value);
    final amount = Text(
      formatted,
      semanticsLabel: '$label, $formatted',
      maxLines: 1,
      softWrap: false,
      textAlign: TextAlign.end,
      style: amountStyle,
    );
    final track = ExcludeSemantics(
      child: SizedBox(
        height: 11,
        child: ColoredBox(
          color: FinStackColors.surfaceVariant,
          child: value <= 0
              ? const SizedBox.expand()
              : Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: FractionallySizedBox(
                    widthFactor: (value / max).clamp(0.0, 1.0),
                    heightFactor: 1,
                    child: ColoredBox(color: color),
                  ),
                ),
        ),
      ),
    );

    if (amountAboveBar) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FittedBox(fit: BoxFit.scaleDown, child: amount),
          ),
          const SizedBox(height: 3),
          track,
        ],
      );
    }

    return Row(
      children: [
        Expanded(child: track),
        const SizedBox(width: 12),
        SizedBox(width: amountWidth, child: amount),
      ],
    );
  }
}
