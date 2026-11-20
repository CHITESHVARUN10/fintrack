import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../core/spending_statistics.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/spending_breakdown.dart';
import '../widgets/states.dart';
import '../widgets/spending_trend.dart';

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
    final selected = await showDateRangePicker(
      context: context,
      firstDate: _firstDate,
      lastDate: _lastDate,
      initialDateRange: _custom ?? _ranges.current,
      helpText: 'Choose spending dates',
      saveText: 'Apply dates',
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
        builder: (context, constraints) => ListView(
          padding: EdgeInsets.fromLTRB(
            math.max(16, (constraints.maxWidth - 720) / 2),
            16,
            math.max(20, (constraints.maxWidth - 720) / 2),
            28,
          ),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            BrutalCard(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _choice(
                        'Today',
                        _period == SpendingPeriod.today,
                        () => _selectPeriod(SpendingPeriod.today),
                      ),
                      _choice(
                        'This month',
                        _period == SpendingPeriod.month &&
                            _month.month == _now.month &&
                            _month.year == _now.year,
                        () => _selectPeriod(SpendingPeriod.month),
                      ),
                      _choice(
                        'Custom dates',
                        _period == SpendingPeriod.custom,
                        () => _selectPeriod(SpendingPeriod.custom),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (_period == SpendingPeriod.month)
                        IconButton(
                          tooltip: 'Previous month',
                          onPressed: _month.isAfter(_firstDate)
                              ? () => _moveMonth(-1)
                              : null,
                          icon: const Icon(Icons.chevron_left),
                        ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              _period == SpendingPeriod.month
                                  ? MaterialLocalizations.of(
                                      context,
                                    ).formatMonthYear(_month)
                                  : _period == SpendingPeriod.today
                                  ? 'Today'
                                  : 'Custom period',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            Text(
                              spendingDateRange(ranges.current),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      if (_period == SpendingPeriod.month)
                        IconButton(
                          tooltip: 'Next month',
                          onPressed:
                              _month.isBefore(DateTime(_lastDate.year, 12))
                              ? () => _moveMonth(1)
                              : null,
                          icon: const Icon(Icons.chevron_right),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Divider(
                    height: 1,
                    thickness: 1,
                    color: FinStackColors.outlineVariant,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: _filterButton(
                          'Category',
                          _category,
                          () => _pickFilter(byVendor: false),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _filterButton(
                          'Vendor',
                          _vendor,
                          () => _pickFilter(byVendor: true),
                        ),
                      ),
                      if (filterActive)
                        IconButton(
                          tooltip: 'Clear filters',
                          onPressed: _clearFilters,
                          icon: const Icon(Icons.filter_alt_off_outlined),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            if (_error case final String message)
              BrutalEmpty(
                icon: Icons.info_outline,
                message: message,
                action: OutlinedButton(
                  onPressed: _load,
                  child: const Text('Retry'),
                ),
              )
            else if (view == null)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(
                    semanticsLabel: 'Loading spending',
                  ),
                ),
              )
            else ...[
              SpendingTrend(
                key: ValueKey((
                  ranges.current.start,
                  ranges.current.end,
                  _category,
                  _vendor,
                )),
                view: view,
                previousRange: upcoming ? null : ranges.previous,
              ),
              if (view.count == 0) ...[
                const SizedBox(height: 16),
                BrutalEmpty(
                  icon: Icons.bar_chart,
                  message: filterActive
                      ? 'No spending matches these filters in this period.'
                      : upcoming
                      ? 'No spending recorded yet for this upcoming period.'
                      : 'No spending recorded for this period.',
                  action: filterActive
                      ? OutlinedButton(
                          onPressed: _clearFilters,
                          child: const Text('Clear filters'),
                        )
                      : _period == SpendingPeriod.month &&
                            _month.isAfter(_firstDate)
                      ? OutlinedButton(
                          onPressed: () => _moveMonth(-1),
                          child: const Text('View previous month'),
                        )
                      : null,
                ),
              ],
              if (!upcoming &&
                  (view.currentPaise > 0 || view.previousPaise > 0)) ...[
                const SizedBox(height: 22),
                Row(
                  children: [
                    Expanded(
                      child: _choice(
                        'By category',
                        !_byVendor,
                        () => _selectBreakdown(false),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _choice(
                        'By vendor',
                        _byVendor,
                        () => _selectBreakdown(true),
                      ),
                    ),
                  ],
                ),
                if (view.count > 0) ...[
                  const SizedBox(height: 10),
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
                        ? FinStackColors.chartTeal
                        : FinStackColors.accentPurple,
                  ),
                ],
                const SizedBox(height: 16),
                _SpendingChanges(
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
        ),
      ),
    );
  }

  void _selectBreakdown(bool byVendor) {
    setState(() {
      _byVendor = byVendor;
      _showAllChanges = false;
    });
  }

  Widget _choice(String label, bool selected, VoidCallback onPressed) =>
      Semantics(
        selected: selected,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 44),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            backgroundColor: selected
                ? FinStackColors.brandYellow
                : Colors.white,
          ),
          onPressed: onPressed,
          child: Text(label, textAlign: TextAlign.center),
        ),
      );

  Widget _filterButton(String label, String? selected, VoidCallback open) =>
      TextButton(
        style: TextButton.styleFrom(
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 4),
        ),
        onPressed: _data != null ? open : null,
        child: Row(
          children: [
            Expanded(
              child: Text(
                selected ??
                    'All ${label == 'Category' ? 'categories' : 'vendors'}',
                semanticsLabel: selected == null
                    ? null
                    : '$label filter, $selected',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Icon(Icons.expand_more, size: 18),
          ],
        ),
      );
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
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      widget.title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      decoration: InputDecoration(
                        labelText: 'Search ${all.substring(4)}',
                        prefixIcon: const Icon(Icons.search),
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
                  itemCount: _query.isEmpty
                      ? options.length + 1
                      : math.max(options.length, 1),
                  itemBuilder: (context, index) {
                    if (_query.isNotEmpty && options.isEmpty) {
                      return const ListTile(title: Text('No matches'));
                    }
                    final String? value = _query.isEmpty
                        ? (index == 0 ? null : options[index - 1])
                        : options[index];
                    final selected = value == widget.selected;
                    return ListTile(
                      selected: selected,
                      selectedTileColor: FinStackColors.surfaceContainer,
                      title: Text(value ?? all),
                      trailing: selected ? const Icon(Icons.check) : null,
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

class _SpendingChanges extends StatelessWidget {
  const _SpendingChanges({
    required this.changes,
    required this.byVendor,
    required this.previousRange,
    required this.showAll,
    required this.onToggle,
  });

  static const _previousColor = Color(0xFF8C826A);

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
    final style = Theme.of(context).textTheme;
    return BrutalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BrutalSectionTitle(
            title: byVendor ? 'Changes by vendor' : 'Changes by category',
            subtitle: 'Compared with ${spendingDateRange(previousRange)}',
            accent: FinStackColors.accentOrange,
          ),
          const SizedBox(height: 12),
          const Wrap(
            spacing: 16,
            runSpacing: 4,
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
          for (final change in showAll ? changes : changes.take(5)) ...[
            const Divider(
              thickness: 1,
              height: 20,
              color: FinStackColors.outlineVariant,
            ),
            Text(change.label, style: style.titleMedium),
            const SizedBox(height: 2),
            Text(
              spendingDelta(change.current, change.previous),
              style: style.bodySmall,
            ),
            const SizedBox(height: 6),
            _bar(
              context,
              'Selected period',
              change.current,
              maxAmount,
              FinStackColors.accentPurple,
            ),
            const SizedBox(height: 4),
            _bar(
              context,
              'Previous period',
              change.previous,
              maxAmount,
              _previousColor,
            ),
          ],
          if (changes.length > 5) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: onToggle,
              child: Text(
                showAll ? 'Show fewer' : 'Show all ${changes.length}',
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _bar(
    BuildContext context,
    String label,
    int value,
    int max,
    Color color,
  ) => Row(
    children: [
      Expanded(
        flex: 3,
        child: ExcludeSemantics(
          child: SizedBox(
            height: 8,
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: value / max,
              child: ColoredBox(color: color),
            ),
          ),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        flex: 2,
        child: Text(
          spendingInr(value),
          semanticsLabel: '$label, ${spendingInr(value)}',
          textAlign: TextAlign.right,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
    ],
  );
}
