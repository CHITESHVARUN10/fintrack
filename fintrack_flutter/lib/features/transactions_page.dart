import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/ledger_categories.dart';
import '../core/vendor_name.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/category_picker.dart';
import '../widgets/states.dart';
import 'activity_review.dart';

const _pageSize = 50;

const _types = [
  'EXPENSE',
  'INCOME',
  'INTERNAL_TRANSFER',
  'CASH_WITHDRAWAL',
  'CASH_EXPENSE',
];

const _typeLabels = {
  'INCOME': 'Income',
  'EXPENSE': 'Expense',
  'INTERNAL_TRANSFER': 'Internal transfer',
  'CASH_WITHDRAWAL': 'Cash withdrawal',
  'CASH_EXPENSE': 'Cash expense',
};

const _modes = ['UPI', 'BANK', 'CASH', 'CARD', 'OTHER'];

const _tabular = <FontFeature>[FontFeature.tabularFigures()];

TextStyle _numStyle({
  double size = 13,
  FontWeight weight = FontWeight.w800,
  Color color = FinStackColors.onSurface,
  double letterSpacing = -0.2,
  double height = 1.2,
}) => FinStackType.amount.copyWith(
  fontSize: size,
  fontWeight: weight,
  letterSpacing: letterSpacing,
  height: height,
  color: color,
  fontFeatures: _tabular,
);

TextStyle _labelStyle({
  double size = 9.5,
  Color color = FinStackColors.onSurfaceVariant,
  double letterSpacing = 0.9,
}) => FinStackType.caption.copyWith(
  fontSize: size,
  letterSpacing: letterSpacing,
  height: 1.25,
  color: color,
);

enum _Period {
  thisMonth('This month'),
  previousMonth('Previous month'),
  allTime('All time'),
  custom('Custom dates');

  const _Period(this.label);
  final String label;
}

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

String _dayLabel(String? iso) {
  final d = DateTime.tryParse(iso ?? '')?.toLocal();
  if (d == null) return 'Unknown date';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  if (day == today) return 'Today';
  if (day == DateTime(now.year, now.month, now.day - 1)) return 'Yesterday';
  return _fmtDate(iso);
}

bool _sameDay(String? a, String? b) {
  final da = DateTime.tryParse(a ?? '')?.toLocal();
  final db = DateTime.tryParse(b ?? '')?.toLocal();
  if (da == null || db == null) return false;
  return da.year == db.year && da.month == db.month && da.day == db.day;
}

IconData _typeIcon(String type) {
  switch (type) {
    case 'INCOME':
      return Icons.south_west;
    case 'INTERNAL_TRANSFER':
      return Icons.swap_horiz;
    case 'CASH_WITHDRAWAL':
      return Icons.local_atm;
    case 'CASH_EXPENSE':
      return Icons.payments;
    default:
      return Icons.north_east;
  }
}

class TransactionsPage extends StatefulWidget {
  const TransactionsPage({
    super.key,
    this.refresh = 0,
    this.showHeader = false,
    this.importedPeriod,
  });

  final int refresh;
  final DateTimeRange? importedPeriod;

  /// Renders a branded Part 2 header with the active ledger badge. Off by
  /// default so the page still works inside a shell that supplies its own bar.
  final bool showHeader;

  @override
  State<TransactionsPage> createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {
  final _scroll = ScrollController();
  final searchCtrl = TextEditingController();
  final vendorCtrl = TextEditingController();

  List<Map<String, dynamic>> items = [];
  Map summary = {};
  int total = 0;
  int page = 0;
  bool hasMore = true;
  bool loading = true;
  bool loadingMore = false;
  String? error;

  bool familyView = false;
  _Period period = _Period.thisMonth;
  int _requestVersion = 0;
  DateTime _today = DateUtils.dateOnly(DateTime.now());

  (DateTime?, DateTime?) get _dateRange => switch (period) {
    _Period.thisMonth => (DateTime(_today.year, _today.month), _today),
    _Period.previousMonth => (
      DateTime(_today.year, _today.month - 1),
      DateTime(_today.year, _today.month, 0),
    ),
    _Period.allTime => (null, null),
    _Period.custom => (fromDate, toDate),
  };
  DateTime? fromDate;
  DateTime? toDate;
  String typeFilter = '';
  String modeFilter = '';
  String vendorId = '';
  String vendorQuery = '';
  String statusFilter = '';
  String categoryFilter = '';
  final categories = <String>{...ledgerCategories};

  @override
  void initState() {
    super.initState();
    final imported = widget.importedPeriod;
    if (imported != null) {
      final start = imported.start;
      final end = imported.end;
      final singleMonth = start.year == end.year && start.month == end.month;
      final previousMonth = DateTime(_today.year, _today.month - 1);
      if (singleMonth &&
          start.year == previousMonth.year &&
          start.month == previousMonth.month) {
        period = _Period.previousMonth;
      } else if (singleMonth &&
          start.year == _today.year &&
          start.month == _today.month &&
          !DateUtils.dateOnly(end).isAfter(_today)) {
        period = _Period.thisMonth;
      } else {
        period = _Period.custom;
        fromDate = singleMonth
            ? DateTime(start.year, start.month)
            : DateUtils.dateOnly(start);
        toDate = singleMonth
            ? DateTime(end.year, end.month + 1, 0)
            : DateUtils.dateOnly(end);
      }
    }
    _scroll.addListener(_onScroll);
    load();
    loadCategories();
  }

  @override
  void didUpdateWidget(covariant TransactionsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.refresh != oldWidget.refresh) load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    searchCtrl.dispose();
    vendorCtrl.dispose();
    super.dispose();
  }

  Future<void> loadCategories() async {
    final saved = await loadLedgerCategories();
    if (mounted && saved.isNotEmpty) {
      setState(() => categories.addAll(saved));
    }
  }

  void _addCategory(String name) {
    if (mounted) setState(() => categories.add(name));
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (error == null &&
        _scroll.position.pixels >= _scroll.position.maxScrollExtent - 420) {
      _loadMore();
    }
  }

  Future<void> load() async {
    if (!mounted) return;
    final version = ++_requestVersion;
    setState(() {
      _today = DateUtils.dateOnly(DateTime.now());
      loading = true;
      loadingMore = false;
      error = null;
      page = 0;
      hasMore = true;
    });
    await _fetch(reset: true, version: version);
  }

  Future<void> _loadMore() async {
    if (loading || loadingMore || !hasMore) return;
    setState(() => loadingMore = true);
    await _fetch(reset: false, version: _requestVersion);
  }

  Map<String, String> _dateParams() {
    final qp = <String, String>{};
    final (from, to) = _dateRange;
    if (from != null) qp['from'] = from.toUtc().toIso8601String();
    if (to != null) {
      final nextDay = DateTime(to.year, to.month, to.day + 1);
      qp['to'] = nextDay
          .subtract(const Duration(milliseconds: 1))
          .toUtc()
          .toIso8601String();
    }
    return qp;
  }

  void _openReview() {
    dismissKeyboard(context);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ActivityReviewSheet(
        dateParams: _dateParams(),
        onChanged: load,
        onOpenTransaction: _showDetail,
      ),
    );
  }

  Future<void> _fetch({required bool reset, required int version}) async {
    try {
      final nextPage = reset ? 1 : page + 1;
      final qp = <String, dynamic>{
        'familyView': familyView,
        'page': nextPage,
        'limit': _pageSize,
        ..._dateParams(),
      };
      if (typeFilter.isNotEmpty) qp['type'] = typeFilter;
      if (modeFilter.isNotEmpty) qp['mode'] = modeFilter;
      if (statusFilter.isNotEmpty) qp['status'] = statusFilter;
      if (categoryFilter.isNotEmpty) qp['category'] = categoryFilter;
      if (vendorCtrl.text.trim().isNotEmpty) {
        qp['vendor'] = vendorQuery.isEmpty
            ? vendorCtrl.text.trim()
            : vendorQuery;
      }

      if (vendorId.isNotEmpty) qp['vendorId'] = vendorId;
      final res = await ApiClient.dio.get('/transactions', queryParameters: qp);
      if (!mounted || version != _requestVersion) return;
      final raw = (res.data['items'] as List?) ?? [];
      final fetched = raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      setState(() {
        items = reset ? fetched : [...items, ...fetched];
        page = nextPage;
        total = (res.data['total'] as num?)?.toInt() ?? items.length;
        hasMore = res.data['hasMore'] == true;
        if (reset) summary = res.data['summary'] ?? {};
        error = null;
      });
    } catch (_) {
      if (mounted && version == _requestVersion) {
        setState(() {
          if (reset) {
            items = [];
            total = 0;
            summary = {};
            hasMore = false;
          }
          error = reset
              ? 'Could not load transactions. Retry when you’re connected.'
              : 'Could not load more transactions. Try again.';
        });
      }
    } finally {
      if (mounted && version == _requestVersion) {
        setState(() {
          loading = false;
          loadingMore = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> get filtered {
    final q = searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((t) {
      final hay =
          '${t['type'] ?? ''} ${t['category'] ?? ''} ${t['mode'] ?? ''} ${t['status'] ?? ''} ${transactionDisplayName(t)} ${t['recipient']?['name'] ?? ''} ${t['productName'] ?? ''}'
              .toLowerCase();
      return hay.contains(q);
    }).toList();
  }

  void _selectPeriod(_Period selection) {
    dismissKeyboard(context);
    setState(() => period = selection);
    load();
  }

  String _periodTitle(BuildContext context) {
    final dates = MaterialLocalizations.of(context);
    final (from, to) = _dateRange;
    return switch (period) {
      _Period.thisMonth ||
      _Period.previousMonth => dates.formatMonthYear(from!),
      _Period.allTime => 'All time',
      _Period.custom
          when from != null &&
              to != null &&
              from.day == 1 &&
              from.year == to.year &&
              from.month == to.month &&
              to.day == DateUtils.getDaysInMonth(to.year, to.month) =>
        dates.formatMonthYear(from),
      _Period.custom => '${numericDateLabel(from!)} – ${numericDateLabel(to!)}',
    };
  }

  Future<void> _openFilters() async {
    dismissKeyboard(context);
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _FiltersSheet(
        period: period,
        fromDate: _dateRange.$1,
        toDate: _dateRange.$2,
        type: typeFilter,
        mode: modeFilter,
        status: statusFilter,
        category: categoryFilter,
        categories: categories,
        vendor: vendorCtrl.text,
        vendorId: vendorId,
        vendorQuery: vendorQuery,
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      period = result['period'] as _Period;
      fromDate = result['from'] as DateTime?;
      toDate = result['to'] as DateTime?;
      typeFilter = '${result['type'] ?? ''}';
      modeFilter = '${result['mode'] ?? ''}';
      statusFilter = '${result['status'] ?? ''}';
      categoryFilter = '${result['category'] ?? ''}';
      vendorCtrl.text = '${result['vendor'] ?? ''}';
      vendorId = '${result['vendorId'] ?? ''}';
      vendorQuery = '${result['vendorQuery'] ?? ''}';
    });
    load();
  }

  List<String> get _filters => [
    if (typeFilter.isNotEmpty) _typeLabels[typeFilter] ?? typeFilter,
    if (modeFilter.isNotEmpty) transactionModeLabel(modeFilter),
    if (statusFilter.isNotEmpty) _filterStatuses[statusFilter] ?? statusFilter,
    if (categoryFilter.isNotEmpty) categoryFilter,
    if (vendorCtrl.text.trim().isNotEmpty) vendorCtrl.text.trim(),
  ];

  void _clearFilters() {
    dismissKeyboard(context);
    setState(() {
      typeFilter = '';
      modeFilter = '';
      vendorId = '';
      vendorQuery = '';
      statusFilter = '';
      categoryFilter = '';
      vendorCtrl.clear();
      searchCtrl.clear();
    });
    load();
  }

  Future<void> _openAdd() async {
    dismissKeyboard(context);
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) =>
          _AddTransactionSheet(categories: categories, onCreated: _addCategory),
    );
    if (added == true) {
      await load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Transaction added to your ledger.')),
      );
    }
  }

  Future<void> _showDetail(Map<String, dynamic> txn) => showActivityTransaction(
    context,
    id: '${txn['_id'] ?? txn['id']}',
    onChanged: load,
    categories: categories,
    onCategoryCreated: _addCategory,
  );

  @override
  Widget build(BuildContext context) {
    final body = Stack(
      children: [
        RefreshIndicator(
          color: FinStackColors.onSurface,
          backgroundColor: FinStackColors.brandYellow,
          onRefresh: load,
          child: ListView.builder(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 104),
            itemCount: _headers.length + _list.length + 1,
            itemBuilder: (context, index) {
              if (index < _headers.length) return _headers[index];
              final i = index - _headers.length;
              final list = _list;
              if (i < list.length) {
                final txn = list[i];
                final previous = i > 0 ? list[i - 1] : null;
                final showDay =
                    previous == null ||
                    !_sameDay(
                      '${previous['occurredAt']}',
                      '${txn['occurredAt']}',
                    );
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (showDay) _dayHeader('${txn['occurredAt']}'),
                    _txnCard(txn),
                  ],
                );
              }
              return _footer(list);
            },
          ),
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: BrutalButton(
            label: 'Add',
            icon: Icons.add,
            fontSize: 13,
            shadow: 4,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            onPressed: _openAdd,
          ),
        ),
      ],
    );
    if (!widget.showHeader) return body;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const FinStackTitle('Activity'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: BrutalTag(
              label: familyView ? 'Family ledger' : 'My ledger',
              color: FinStackColors.surfaceContainer,
            ),
          ),
        ],
      ),
      body: BrutalGrid(child: body),
    );
  }

  List<Map<String, dynamic>> get _list =>
      loading && items.isEmpty ? const [] : filtered;

  List<Widget> get _headers {
    final actual = ((summary['actualExpenditurePaise'] ?? 0) as num) / 100;
    final movement = ((summary['totalMovementPaise'] ?? 0) as num) / 100;
    final firstLoad = loading && items.isEmpty;
    return [
      _scopeToggle(),
      const SizedBox(height: 14),
      _summaryCard(actual, movement),
      const SizedBox(height: 14),
      if (items.isNotEmpty || searchCtrl.text.isNotEmpty) ...[
        _searchField(),
        const SizedBox(height: 14),
      ],
      if (firstLoad)
        const _SkeletonFeed()
      else if (error != null && items.isEmpty)
        _errorCard()
      else if (_list.isEmpty)
        _emptyState(),
    ];
  }

  Widget _scopeToggle() {
    return Row(
      children: [
        Expanded(
          child: _HardPress(
            shadow: 3,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            color: familyView ? Colors.white : FinStackColors.brandYellow,
            selected: !familyView,
            semanticLabel: 'My activity',
            onTap: () {
              if (!familyView) return;
              dismissKeyboard(context);
              setState(() => familyView = false);
              load();
            },
            child: Text(
              'My activity',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.2,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _HardPress(
            shadow: 3,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            color: familyView ? FinStackColors.brandYellow : Colors.white,
            selected: familyView,
            semanticLabel: 'Family activity',
            onTap: () {
              if (familyView) return;
              dismissKeyboard(context);
              setState(() => familyView = true);
              load();
            },
            child: Text(
              'Family',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.2,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _summaryCard(double spent, double movement) {
    final active = _filters;
    final firstLoad = loading && items.isEmpty;
    return BrutalCard(
      color: FinStackColors.surfaceContainer,
      shadow: 5,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        _periodTitle(context),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(
                              fontSize: 22,
                              height: 1.1,
                              letterSpacing: -0.4,
                            ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      firstLoad
                          ? 'Loading ledger…'
                          : '$total transaction${total == 1 ? '' : 's'}',
                      style: _numStyle(
                        size: 11.5,
                        weight: FontWeight.w700,
                        color: FinStackColors.onSurfaceVariant,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _HardPress(
                onTap: _openFilters,
                shadow: 2.5,
                padding: const EdgeInsets.symmetric(
                  horizontal: 11,
                  vertical: 10,
                ),
                semanticLabel: active.isEmpty
                    ? 'Filters'
                    : 'Filters, ${active.length} active',
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.tune, size: 15),
                    const SizedBox(width: 6),
                    const Text(
                      'Filters',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                    if (active.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: FinStackColors.accentPink,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: FinStackColors.onSurface,
                            width: 1.5,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _SummaryStat(
                  label: 'Spent',
                  value: firstLoad ? '—' : inr(spent),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _SummaryStat(
                  label: 'Movement',
                  value: firstLoad ? '—' : inr(movement),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              icon: const Icon(Icons.fact_check_outlined, size: 18),
              label: const Text('Review transactions'),
              onPressed: _openReview,
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchField() {
    return Container(
      decoration: const BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: FinStackColors.onSurface,
            offset: Offset(3, 3),
            blurRadius: 0,
          ),
        ],
      ),
      child: TextField(
        controller: searchCtrl,
        onChanged: (_) => setState(() {}),
        textInputAction: TextInputAction.search,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: 'Search loaded transactions',
          prefixIcon: const Icon(Icons.search, size: 18),
          prefixIconConstraints: const BoxConstraints(
            minWidth: 40,
            minHeight: 0,
          ),
          suffixIcon: searchCtrl.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  onPressed: () => setState(searchCtrl.clear),
                  icon: const Icon(Icons.close, size: 18),
                ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 12,
          ),
        ),
      ),
    );
  }

  Widget _errorCard() {
    return BrutalCard(
      color: FinStackColors.errorContainer,
      border: 2.5,
      shadow: 3,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'COULD NOT LOAD',
            style: _labelStyle(
              color: FinStackColors.onErrorContainer,
              letterSpacing: 0.7,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            error!,
            style: const TextStyle(
              color: FinStackColors.onErrorContainer,
              fontWeight: FontWeight.w700,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          BrutalButton(label: 'Retry', icon: Icons.refresh, onPressed: load),
        ],
      ),
    );
  }

  Widget _emptyState() {
    final hasSearch = items.isNotEmpty && searchCtrl.text.trim().isNotEmpty;
    final hasFilters = _filters.isNotEmpty;
    final currentMonth = period == _Period.thisMonth;
    final month = MaterialLocalizations.of(context).formatMonthYear(_today);
    final message = hasSearch
        ? 'No matches in the loaded transactions.'
        : hasFilters
        ? 'No transactions match the filters for this period.'
        : currentMonth
        ? 'No transactions in $month so far. You can check the previous month.'
        : period == _Period.allTime
        ? 'No transactions yet. Scan a QR or add one to get started.'
        : 'No transactions for ${_periodTitle(context)}.';
    final action = hasSearch
        ? BrutalButton(
            block: true,
            label: 'Clear search',
            onPressed: () => setState(searchCtrl.clear),
          )
        : hasFilters
        ? BrutalButton(
            block: true,
            label: 'Clear filters',
            onPressed: _clearFilters,
          )
        : currentMonth
        ? BrutalButton(
            block: true,
            label: 'View previous month',
            icon: Icons.arrow_back,
            onPressed: () => _selectPeriod(_Period.previousMonth),
          )
        : period == _Period.allTime
        ? null
        : BrutalButton(
            block: true,
            label: 'Back to this month',
            icon: Icons.calendar_today_outlined,
            onPressed: () => _selectPeriod(_Period.thisMonth),
          );
    return Container(
      decoration: brutal(color: Colors.white, border: 3, shadow: 5),
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: FinStackColors.brandYellow,
                  border: Border.all(
                    color: FinStackColors.onSurface,
                    width: 2.5,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: FinStackColors.onSurface,
                      offset: Offset(2.5, 2.5),
                      blurRadius: 0,
                    ),
                  ],
                ),
                child: Icon(
                  hasFilters || hasSearch
                      ? Icons.search_off
                      : Icons.receipt_long_outlined,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    message,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.45,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (action != null) ...[const SizedBox(height: 14), action],
        ],
      ),
    );
  }

  Widget _dayHeader(String? iso) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 8),
    child: Row(
      children: [
        Container(
          width: 6,
          height: 14,
          decoration: BoxDecoration(
            color: FinStackColors.brandYellow,
            border: Border.all(color: FinStackColors.onSurface, width: 1.5),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          _dayLabel(iso).toUpperCase(),
          style: _labelStyle(size: 11, letterSpacing: 0.9),
        ),
      ],
    ),
  );

  Widget _txnCard(Map<String, dynamic> t) {
    final type = '${t['type'] ?? ''}';
    final isIncome = type == 'INCOME';
    final paise = (t['amountPaise'] as num?) ?? 0;
    final vendor = transactionDisplayName(t);
    final mode = transactionModeLabel(t['mode']);
    final offset = t['isOffset'] == true;
    final status = '${t['status'] ?? ''}';
    final category = '${t['category'] ?? ''}';
    final subcategory = '${t['subcategory'] ?? ''}';
    final categoryLabel =
        ledgerFinanceSubcategories.containsKey(category) &&
            subcategory.isNotEmpty
        ? '$category / $subcategory'
        : category;
    final creator = (t['createdBy'] as Map?)?['name'];
    final meta = [
      if (categoryLabel.isNotEmpty) categoryLabel,
      if (offset) 'Offset',
      if ('${t['visibility'] ?? ''}' == 'PRIVATE') 'PRIVATE',
      if (familyView && creator != null) 'by $creator',
    ].join(' · ');
    final amount = '${isIncome ? '+' : ''}${inrPaise(paise)}';
    final statusLabel = (status.isEmpty ? type : status).replaceAll('_', ' ');
    final (tagBg, tagFg) = status == 'RECONCILED'
        ? (FinStackColors.tertiary, FinStackColors.onSurface)
        : status == 'PENDING_REVIEW'
        ? (FinStackColors.errorContainer, FinStackColors.onErrorContainer)
        : (Colors.white, FinStackColors.onSurface);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _HardPress(
        onTap: () => _showDetail(t),
        shadow: 3,
        padding: const EdgeInsets.all(12),
        semanticLabel:
            '$vendor, $mode, $amount, ${offset ? 'Offset' : statusLabel}',
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: isIncome
                    ? FinStackColors.tertiary
                    : FinStackColors.surfaceContainer,
                border: Border.all(color: FinStackColors.onSurface, width: 2),
              ),
              child: Icon(_typeIcon(type), size: 19),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    vendor,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      height: 1.2,
                    ),
                  ),
                  if (meta.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        height: 1.25,
                        color: FinStackColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 132),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(
                      amount,
                      style: _numStyle(size: 15, letterSpacing: -0.45),
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                BrutalTag(label: mode, color: tagBg, textColor: tagFg),
                if (status == 'PENDING_REVIEW')
                  const Padding(
                    padding: EdgeInsets.only(top: 3),
                    child: Text(
                      'Needs review',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _footer(List<Map<String, dynamic>> list) {
    if (loading) return const SizedBox.shrink();
    if (loadingMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Semantics(
          label: 'Loading more transactions',
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
              SizedBox(width: 8),
              Text(
                'Loading more…',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      );
    }
    if (items.isEmpty) return const SizedBox(height: 20);
    if (hasMore) {
      return Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 8),
        child: Column(
          children: [
            if (error != null) ...[
              Text(
                error!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: FinStackColors.onErrorContainer,
                ),
              ),
              const SizedBox(height: 8),
            ],
            Text(
              '${items.length} of $total shown',
              style: _numStyle(
                size: 11,
                weight: FontWeight.w700,
                color: FinStackColors.onSurfaceVariant,
                letterSpacing: 0.1,
              ),
            ),
            const SizedBox(height: 8),
            BrutalButton(
              label: error == null ? 'Load more' : 'Retry loading more',
              icon: error == null ? Icons.expand_more : Icons.refresh,
              onPressed: _loadMore,
            ),
          ],
        ),
      );
    }
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: FinStackColors.surfaceContainer,
        border: Border.all(color: FinStackColors.onSurface, width: 2.5),
      ),
      child: Text(
        list.length == total
            ? 'All $total transactions loaded'
            : '${list.length} of $total shown',
        textAlign: TextAlign.center,
        style: _numStyle(
          size: 11.5,
          weight: FontWeight.w700,
          letterSpacing: 0.1,
        ),
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
    decoration: brutal(color: Colors.white, border: 2.5, shadow: 2.5),
    padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: _labelStyle(size: 9.5)),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, style: _numStyle(size: 17, letterSpacing: -0.5)),
        ),
      ],
    ),
  );
}

class _SkeletonFeed extends StatelessWidget {
  const _SkeletonFeed();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Loading transactions',
      child: Column(
        children: [for (var i = 0; i < 3; i++) const _SkeletonCard()],
      ),
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(12),
    decoration: brutal(color: Colors.white, border: 2.5, shadow: 3),
    child: Row(
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: FinStackColors.surfaceContainer,
            border: Border.all(color: FinStackColors.onSurface, width: 2),
          ),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 130,
                height: 10,
                color: FinStackColors.surfaceHigh,
              ),
              const SizedBox(height: 8),
              Container(
                width: 190,
                height: 8,
                color: FinStackColors.surfaceContainer,
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Container(width: 64, height: 11, color: FinStackColors.surfaceHigh),
            const SizedBox(height: 8),
            Container(
              width: 46,
              height: 14,
              decoration: BoxDecoration(
                color: FinStackColors.surfaceContainer,
                border: Border.all(color: FinStackColors.onSurface, width: 1.5),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _HardPress extends StatefulWidget {
  const _HardPress({
    required this.child,
    this.onTap,
    this.color = Colors.white,
    this.shadow = 3,
    this.padding = EdgeInsets.zero,
    this.semanticLabel,
    this.selected,
  });

  final Widget child;
  final VoidCallback? onTap;
  final Color color;
  final double shadow;
  final EdgeInsets padding;
  final String? semanticLabel;
  final bool? selected;

  @override
  State<_HardPress> createState() => _HardPressState();
}

class _HardPressState extends State<_HardPress> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    final shift = _down && enabled
        ? (widget.shadow >= 3 ? 3.0 : widget.shadow)
        : 0.0;
    final box = AnimatedContainer(
      duration: const Duration(milliseconds: 90),
      curve: Curves.easeOut,
      transform: Matrix4.translationValues(shift, shift, 0),
      padding: widget.padding,
      decoration: BoxDecoration(
        color: widget.color,
        border: Border.all(color: FinStackColors.onSurface, width: 2.5),
        boxShadow: enabled && !_down
            ? [
                BoxShadow(
                  color: FinStackColors.onSurface,
                  offset: Offset(widget.shadow, widget.shadow),
                  blurRadius: 0,
                ),
              ]
            : null,
      ),
      child: widget.child,
    );
    final gesture = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: enabled ? (_) => setState(() => _down = true) : null,
      onTapUp: enabled ? (_) => setState(() => _down = false) : null,
      onTapCancel: enabled ? () => setState(() => _down = false) : null,
      onTap: widget.onTap,
      child: box,
    );
    final label = widget.semanticLabel;
    if (label == null) return gesture;
    return Semantics(
      container: true,
      button: true,
      selected: widget.selected,
      label: label,
      excludeSemantics: true,
      onTap: widget.onTap,
      child: gesture,
    );
  }
}

class _SheetButton extends StatelessWidget {
  const _SheetButton({
    required this.label,
    this.onPressed,
    this.color = FinStackColors.brandYellow,
    this.icon,
    this.fontSize = 12,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
  });

  final String label;
  final VoidCallback? onPressed;
  final Color color;
  final IconData? icon;
  final double fontSize;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return _HardPress(
      onTap: onPressed,
      color: enabled ? color : color.withValues(alpha: 0.45),
      padding: padding,
      semanticLabel: label,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Icon(icon, size: fontSize + 4),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({
    required this.title,
    this.subtitle,
    this.tag,
    this.closeLabel = 'Close',
  });

  final String title;
  final String? subtitle;
  final Widget? tag;
  final String closeLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (tag != null) ...[tag!, const SizedBox(height: 6)],
              Semantics(
                header: true,
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontSize: 20,
                    height: 1.1,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(
                  subtitle!,
                  style: _numStyle(
                    size: 11,
                    weight: FontWeight.w700,
                    color: FinStackColors.onSurfaceVariant,
                    letterSpacing: 0.1,
                    height: 1.3,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 10),
        BrutalIconButton(
          icon: Icons.close,
          tooltip: closeLabel,
          size: 32,
          color: FinStackColors.surfaceContainer,
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

class _SheetSelect extends StatelessWidget {
  const _SheetSelect({
    required this.label,
    required this.initialValue,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String initialValue;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: _labelStyle(size: 10, letterSpacing: 0.7),
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: initialValue,
          icon: const Icon(Icons.expand_more, size: 20),
          style: const TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: FinStackColors.onSurface,
          ),
          items: [
            for (final entry in options.entries)
              DropdownMenuItem(
                value: entry.key,
                child: Text(entry.value, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (value) {
            if (value != null) onChanged(value);
          },
        ),
      ],
    );
  }
}

const _filterStatuses = {
  'PENDING_REVIEW': 'Needs review',
  'ACTIVE': 'Active',
  'RECONCILED': 'Reconciled',
};

class _FiltersSheet extends StatefulWidget {
  final _Period period;
  final DateTime? fromDate;
  final DateTime? toDate;
  final String type;
  final String mode;
  final String status;
  final String category;
  final String vendor;
  final String vendorId;
  final String vendorQuery;
  final Set<String> categories;
  const _FiltersSheet({
    required this.period,
    this.fromDate,
    this.toDate,
    required this.type,
    required this.mode,
    required this.status,
    required this.category,
    required this.categories,
    required this.vendor,
    required this.vendorId,
    required this.vendorQuery,
  });

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  final _today = DateUtils.dateOnly(DateTime.now());
  late _Period period = widget.period;
  late DateTime from = widget.fromDate ?? DateTime(_today.year, _today.month);
  late DateTime to = widget.toDate ?? _today;
  late String type = widget.type;
  late String mode = widget.mode;
  late String status = widget.status;
  late String category = widget.category;
  late final TextEditingController vendorCtrl = TextEditingController(
    text: widget.vendor,
  );

  late String vendorId = widget.vendorId;
  late String vendorQuery = widget.vendorQuery;
  Timer? vendorDebounce;
  CancelToken? vendorRequest;
  List<Map> vendors = [];
  bool lookingUp = false;

  @override
  void dispose() {
    vendorDebounce?.cancel();
    vendorRequest?.cancel();
    vendorCtrl.dispose();
    super.dispose();
  }

  void _lookupVendor(String text) {
    vendorDebounce?.cancel();
    vendorRequest?.cancel();
    final query = text.trim();
    setState(() {
      vendorId = '';
      vendorQuery = '';
      vendors = [];
      lookingUp = query.length >= 2;
    });
    if (!lookingUp) return;
    vendorDebounce = Timer(const Duration(milliseconds: 260), () async {
      final token = vendorRequest = CancelToken();
      try {
        final response = await ApiClient.dio.get(
          '/recipients',
          queryParameters: {'q': query, 'limit': 6},
          cancelToken: token,
        );
        if (!mounted || token.isCancelled) return;
        final data = response.data;
        if (data is Map && data['items'] is List) {
          setState(
            () => vendors = (data['items'] as List).whereType<Map>().toList(),
          );
        }
      } catch (_) {
        // Apply filters still accepts a typed merchant or UPI ID.
      } finally {
        if (mounted && !token.isCancelled) setState(() => lookingUp = false);
      }
    });
  }

  void _chooseVendor(Map vendor) {
    vendorDebounce?.cancel();
    vendorRequest?.cancel();
    dismissKeyboard(context);
    final upi = '${vendor['upiId'] ?? ''}';
    final name = readableVendorName(
      '${vendor['label'] ?? vendor['vendorKey'] ?? upi}',
    );
    setState(() {
      vendorCtrl.text = name;
      vendorId = '${vendor['_id'] ?? ''}';
      vendorQuery = upi.isNotEmpty ? upi : name;
      vendors = [];
      lookingUp = false;
    });
  }

  Future<void> _pick(bool isFrom) async {
    dismissKeyboard(context);
    final picked = await showDatePicker(
      context: context,
      helpText: isFrom ? 'Choose start date' : 'Choose end date',
      firstDate: isFrom ? DateTime(1900) : from,
      lastDate: isFrom ? to : _today,
      initialDate: isFrom ? from : to,
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isFrom) {
        from = picked;
      } else {
        to = picked;
      }
    });
  }

  void _apply({bool reset = false}) {
    dismissKeyboard(context);
    Navigator.of(context).pop({
      'period': reset ? _Period.thisMonth : period,
      'from': reset ? null : from,
      'to': reset ? null : to,
      'type': reset ? '' : type,
      'mode': reset ? '' : mode,
      'status': reset ? '' : status,
      'category': reset ? '' : category,
      'vendor': reset ? '' : vendorCtrl.text.trim(),
      'vendorId': reset ? '' : vendorId,
      'vendorQuery': reset ? '' : vendorQuery,
    });
  }

  String _subtitle(BuildContext context) {
    final dates = MaterialLocalizations.of(context);
    final month = switch (period) {
      _Period.thisMonth => dates.formatMonthYear(
        DateTime(_today.year, _today.month),
      ),
      _Period.previousMonth => dates.formatMonthYear(
        DateTime(_today.year, _today.month - 1),
      ),
      _Period.allTime => 'all-time',
      _Period.custom =>
        '${dates.formatShortDate(from)} – ${dates.formatShortDate(to)}',
    };
    return 'Narrow down your $month ledger';
  }

  @override
  Widget build(BuildContext context) {
    final dates = MaterialLocalizations.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.86,
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(16, 18, 16, 24 + bottomInset),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _SheetHeader(
                title: 'Filter transactions',
                subtitle: _subtitle(context),
                closeLabel: 'Close filters',
              ),
              const SizedBox(height: 16),
              _SheetSelect(
                label: 'Date range',
                initialValue: period.name,
                options: {
                  for (final option in _Period.values)
                    option.name: option.label,
                },
                onChanged: (value) =>
                    setState(() => period = _Period.values.byName(value)),
              ),
              if (period == _Period.custom) ...[
                const SizedBox(height: 10),
                _SheetButton(
                  label: 'From ${dates.formatShortDate(from)}',
                  color: Colors.white,
                  fontSize: 12,
                  onPressed: () => _pick(true),
                ),
                const SizedBox(height: 8),
                _SheetButton(
                  label: 'Through ${dates.formatShortDate(to)}',
                  color: Colors.white,
                  fontSize: 12,
                  onPressed: () => _pick(false),
                ),
              ],
              const SizedBox(height: 13),
              _SheetSelect(
                label: 'Transaction type',
                initialValue: type,
                options: const {'': 'Any type', ..._typeLabels},
                onChanged: (value) => setState(() => type = value),
              ),
              const SizedBox(height: 13),
              _SheetSelect(
                label: 'Payment method',
                initialValue: mode,
                options: const {
                  '': 'Any method',
                  'UPI': 'UPI',
                  'BANK': 'Bank',
                  'CASH': 'Cash',
                  'CARD': 'Card',
                  'OTHER': 'Other',
                },
                onChanged: (value) => setState(() => mode = value),
              ),
              const SizedBox(height: 13),
              _SheetSelect(
                label: 'Status',
                initialValue: status,
                options: const {'': 'Any status', ..._filterStatuses},
                onChanged: (value) => setState(() => status = value),
              ),
              const SizedBox(height: 13),
              CategoryChoice(
                label: 'Category',
                value: category,
                options: {
                  '': 'Any category',
                  for (final name in widget.categories) name: name,
                },
                onSelected: (value) => setState(() => category = value),
              ),
              const SizedBox(height: 13),
              BrutalField(
                label: 'Merchant or UPI ID',
                controller: vendorCtrl,
                hint: 'Search saved merchants',
                onChanged: _lookupVendor,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _apply(),
              ),
              if (lookingUp)
                const LinearProgressIndicator(
                  semanticsLabel: 'Finding merchants',
                ),
              for (final vendor in vendors)
                ListTile(
                  dense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  title: Text(
                    readableVendorName(
                      '${vendor['label'] ?? vendor['vendorKey'] ?? ''}',
                    ),
                  ),
                  subtitle: vendor['upiId'] == null
                      ? null
                      : Text('${vendor['upiId']}'),
                  leading: const Icon(Icons.storefront_outlined),
                  onTap: () => _chooseVendor(vendor),
                ),
              const SizedBox(height: 18),
              _SheetButton(label: 'Apply filters', onPressed: () => _apply()),
              const SizedBox(height: 9),
              _SheetButton(
                label: 'Reset to this month',
                color: Colors.white,
                onPressed: () => _apply(reset: true),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddTransactionSheet extends StatefulWidget {
  const _AddTransactionSheet({
    required this.categories,
    required this.onCreated,
  });

  final Set<String> categories;
  final ValueChanged<String> onCreated;
  @override
  State<_AddTransactionSheet> createState() => _AddTransactionSheetState();
}

class _AddTransactionSheetState extends State<_AddTransactionSheet> {
  final amountCtrl = TextEditingController();
  final recipientCtrl = TextEditingController();
  String type = 'EXPENSE';
  String mode = 'UPI';
  String category = 'Other';
  String subcategory = '';
  bool adding = false;
  String? error;

  @override
  void dispose() {
    amountCtrl.dispose();
    recipientCtrl.dispose();
    super.dispose();
  }

  Future<void> add() async {
    dismissKeyboard(context);
    final amount =
        double.tryParse(amountCtrl.text.trim().replaceAll(',', '')) ?? 0;
    if (amount <= 0) {
      setState(() => error = 'Enter an amount greater than zero.');
      return;
    }
    if (adding) return;
    setState(() {
      adding = true;
      error = null;
    });
    try {
      await ApiClient.dio.post(
        '/transactions',
        data: {
          'amountPaise': (amount * 100).round(),
          'type': type,
          'mode': mode,
          'category': category,
          if (subcategory.isNotEmpty) 'subcategory': subcategory,
          'occurredAt': DateTime.now().toUtc().toIso8601String(),
          'recipient': recipientCtrl.text.trim().isNotEmpty
              ? {'name': recipientCtrl.text.trim()}
              : null,
        },
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Could not add the transaction. Check your connection and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.86,
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(16, 18, 16, 24 + bottomInset),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _SheetHeader(
                title: 'ADD TRANSACTION',
                closeLabel: 'Close add transaction',
                tag: BrutalTag(
                  label: 'Manual entry',
                  color: FinStackColors.brandYellow,
                ),
              ),
              const SizedBox(height: 16),
              BrutalField(
                label: 'Amount ₹',
                controller: amountCtrl,
                hint: '0',
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => add(),
              ),
              const SizedBox(height: 13),
              BrutalField(
                label: 'Recipient (optional)',
                controller: recipientCtrl,
                hint: 'Merchant or person',
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 13),
              _SheetSelect(
                label: 'Type',
                initialValue: type,
                options: {for (final option in _types) option: option},
                onChanged: (value) => setState(() => type = value),
              ),
              const SizedBox(height: 13),
              _SheetSelect(
                label: 'Payment method',
                initialValue: mode,
                options: {for (final option in _modes) option: option},
                onChanged: (value) => setState(() => mode = value),
              ),
              const SizedBox(height: 13),
              CategoryFields(
                category: category,
                subcategory: subcategory,
                categories: widget.categories,
                enabled: !adding,
                onCreated: widget.onCreated,
                onChanged: (parent, child) => setState(() {
                  category = parent;
                  subcategory = child;
                }),
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    error!,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: FinStackColors.onErrorContainer,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 18),
              _SheetButton(
                label: adding ? 'Adding…' : 'Add transaction',
                icon: Icons.add,
                onPressed: adding ? null : add,
              ),
              const SizedBox(height: 9),
              _SheetButton(
                label: 'Cancel',
                color: Colors.white,
                onPressed: adding
                    ? null
                    : () => Navigator.of(context).pop(false),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Detail sheet mirrors website drawer: GET /transactions/:id,
/// editable category, visibility toggle, resolve actions.
Future<void> showActivityTransaction(
  BuildContext context, {
  required String id,
  required VoidCallback onChanged,
  Set<String>? categories,
  ValueChanged<String>? onCategoryCreated,
}) async {
  dismissKeyboard(context);
  final available = categories ?? <String>{...ledgerCategories};
  if (categories == null) {
    try {
      final response = await ApiClient.dio.get<Map>('/recipients/categories');
      final remote = response.data?['categories'];
      if (remote is List) available.addAll(remote.whereType<String>());
    } catch (_) {
      // Built-in and existing row categories remain available.
    }
  }
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _TxDetailSheet(
      id: id,
      onChanged: onChanged,
      categories: available,
      onCreated: onCategoryCreated ?? available.add,
    ),
  );
}

class _TxDetailSheet extends StatefulWidget {
  final String id;
  final VoidCallback onChanged;
  final Set<String> categories;
  final ValueChanged<String> onCreated;
  const _TxDetailSheet({
    required this.id,
    required this.onChanged,
    required this.categories,
    required this.onCreated,
  });
  @override
  State<_TxDetailSheet> createState() => _TxDetailSheetState();
}

class _TxDetailSheetState extends State<_TxDetailSheet> {
  Map? detail;
  bool loading = true;
  String editCategory = 'Other';
  String editSubcategory = '';
  bool busy = false;
  bool categorySaved = false;
  Timer? feedbackTimer;

  @override
  void initState() {
    super.initState();
    fetch();
  }

  @override
  void dispose() {
    feedbackTimer?.cancel();
    super.dispose();
  }

  Future<void> fetch() async {
    try {
      final res = await ApiClient.dio.get('/transactions/${widget.id}');
      if (!mounted) return;
      setState(() {
        detail = res.data;
        editCategory =
            (res.data['transaction']?['category'] ?? 'Other') as String;
        editSubcategory =
            (res.data['transaction']?['subcategory'] ?? '') as String;
      });
    } catch (_) {
      if (mounted && detail == null) setState(() => detail = {});
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> patch(Map<String, dynamic> body) async {
    setState(() => busy = true);
    try {
      await ApiClient.dio.patch('/transactions/${widget.id}', data: body);
      await fetch();
      widget.onChanged();
      if (mounted && body.containsKey('category')) {
        feedbackTimer?.cancel();
        setState(() => categorySaved = true);
        feedbackTimer = Timer(const Duration(milliseconds: 1800), () {
          if (mounted) setState(() => categorySaved = false);
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ApiClient.errorMessage(
                e,
                'Could not save the change. Try again.',
              ),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _offset(Map tx) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ActivityOffsetSheet(transaction: tx),
    );
    if (saved != true || !mounted) return;
    await fetch();
    widget.onChanged();
  }

  Future<void> _removeOffset() async {
    setState(() => busy = true);
    try {
      await ApiClient.dio.delete('/transactions/${widget.id}/offset');
      await fetch();
      widget.onChanged();
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ApiClient.errorMessage(err, 'Could not remove the offset.'),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resolve(String action) async {
    setState(() => busy = true);
    try {
      final tx = detail?['transaction'];
      await ApiClient.dio.post(
        '/transactions/${widget.id}/resolve',
        data: {
          'action': action,
          if (action == 'merge' && tx?['candidateOf'] != null)
            'targetId': tx!['candidateOf'],
        },
      );
      if (mounted) Navigator.pop(context);
      widget.onChanged();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not resolve the duplicate. Try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tx = detail?['transaction'];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.86,
      minChildSize: 0.45,
      maxChildSize: 0.96,
      builder: (context, ctrl) {
        if (loading) {
          return const BrutalLoading(label: 'Loading transaction', cards: 2);
        }
        if (tx == null) {
          return SafeArea(
            top: false,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
              children: [
                const _SheetHeader(
                  title: 'Transaction',
                  subtitle: 'Details unavailable',
                  closeLabel: 'Close transaction',
                ),
                const SizedBox(height: 14),
                BrutalCard(
                  color: FinStackColors.errorContainer,
                  border: 2.5,
                  shadow: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Could not load this transaction.',
                        style: const TextStyle(
                          color: FinStackColors.onErrorContainer,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 10),
                      BrutalButton(
                        label: 'Retry',
                        icon: Icons.refresh,
                        onPressed: () {
                          setState(() => loading = true);
                          fetch();
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }
        final paise = ((tx['amountPaise'] ?? 0) as num).toDouble();
        final vis = '${tx['visibility'] ?? 'FAMILY'}';
        final status = '${tx['status'] ?? ''}';
        final sources = (detail?['sources'] as List?) ?? const [];
        final firstSource = sources.isNotEmpty && sources.first is Map
            ? sources.first as Map
            : null;
        final name = transactionDisplayName(tx);
        final partyLabel = tx['type'] == 'INCOME' ? 'Payer' : 'Merchant';
        final mode = transactionModeLabel(tx['mode']);
        final upi =
            tx['upiId'] ??
            tx['recipient']?['upiId'] ??
            tx['sender']?['upiId'] ??
            firstSource?['upiId'] ??
            '—';
        final utr = tx['utr'] ?? firstSource?['utr'] ?? '—';
        final subscription = tx['subscriptionRef'] is Map
            ? (tx['subscriptionRef'] as Map)['name'] ?? 'linked'
            : tx['subscriptionRef'] != null
            ? 'linked'
            : null;
        final financeLink = tx['financeLink'] as Map?;
        final financeName = detail?['financeRecordName'];
        final financeRole = switch (financeLink?['role']) {
          'deposit' => 'Deposit funding',
          'maturity' => 'Maturity payout',
          'purchase' => 'Stock purchase',
          'dividend' => 'Dividend',
          'receipt' => 'Income received',
          _ => null,
        };
        final offset = detail?['offset'] as Map?;
        final counterEntries =
            (offset?['transactions'] as List?)?.whereType<Map>() ??
            [if (offset?['transaction'] is Map) offset!['transaction'] as Map];
        final offsetType = switch (offset?['kind']) {
          'purchase_on_behalf' => 'Paid for someone',
          'loan_repayment' => 'Loan repayment',
          _ => 'Offset',
        };
        final canEdit = detail?['canModify'] != false;
        final canOffset =
            canEdit &&
            offset == null &&
            tx['isOffset'] != true &&
            const ['ACTIVE', 'RECONCILED'].contains(status) &&
            const ['INCOME', 'EXPENSE', 'CASH_EXPENSE'].contains(tx['type']);
        final statusLabel = status.replaceAll('_', ' ');
        return SafeArea(
          top: false,
          child: ListView(
            controller: ctrl,
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
            children: [
              _SheetHeader(
                title:
                    '${inrPaise(paise)} · ${_typeLabels[tx['type']] ?? 'Transaction'}',
                subtitle:
                    '${_fmtDate('${tx['occurredAt'] ?? ''}')} · $mode · $statusLabel',
                closeLabel: 'Close transaction',
              ),
              const SizedBox(height: 14),
              BrutalCard(
                border: 2.5,
                shadow: 3,
                padding: const EdgeInsets.all(13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (financeLink != null || !canEdit) ...[
                      Text('Category', style: _labelStyle()),
                      Text(
                        [
                          if (tx['category'] != null) '${tx['category']}',
                          if (tx['subcategory'] != null) '${tx['subcategory']}',
                        ].join(' / '),
                      ),
                      if (financeLink != null)
                        Text(
                          financeLink['resource'] == 'income'
                              ? 'Managed by the linked income source.'
                              : 'Managed by the linked investment.',
                          style: _labelStyle(),
                        ),
                    ] else ...[
                      CategoryFields(
                        category: editCategory,
                        subcategory: editSubcategory,
                        categories: widget.categories,
                        enabled: !busy,
                        onCreated: widget.onCreated,
                        onChanged: (parent, child) => setState(() {
                          editCategory = parent;
                          editSubcategory = child;
                          categorySaved = false;
                        }),
                      ),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: _SheetButton(
                          label: busy
                              ? 'Saving…'
                              : categorySaved
                              ? 'Saved ✓'
                              : 'Save category',
                          fontSize: 11,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 9,
                          ),
                          onPressed: busy || categorySaved
                              ? null
                              : () => patch({
                                  'category': editCategory,
                                  'subcategory': editSubcategory.isEmpty
                                      ? null
                                      : editSubcategory,
                                }),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              BrutalCard(
                border: 2.5,
                shadow: 3,
                padding: const EdgeInsets.all(13),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'VISIBILITY',
                            style: _labelStyle(color: FinStackColors.onSurface),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            vis,
                            style: const TextStyle(
                              fontFamily: 'Space Grotesk',
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.2,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Private stays hidden even when the month is shared.',
                            style: TextStyle(
                              fontSize: 11,
                              height: 1.4,
                              color: FinStackColors.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Flexible(
                      child: _SheetButton(
                        label: vis == 'PRIVATE'
                            ? 'Make family'
                            : 'Make private',
                        fontSize: 11,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 9,
                        ),
                        onPressed: busy
                            ? null
                            : () => patch({
                                'visibility': vis == 'PRIVATE'
                                    ? 'FAMILY'
                                    : 'PRIVATE',
                              }),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              BrutalCard(
                border: 2.5,
                shadow: 3,
                padding: const EdgeInsets.all(13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Transaction details',
                      style: _labelStyle(color: FinStackColors.onSurface),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      [
                        '$partyLabel: $name',
                        'Method: $mode',
                        'UPI: $upi',
                        'UTR: $utr',
                        if (subscription != null) 'Subscription: $subscription',
                        if (financeLink?['resource'] == 'investments')
                          'Investment: ${financeName ?? 'Linked'}${financeRole == null ? '' : ' · $financeRole'}'
                        else if (financeLink?['resource'] == 'income')
                          'Income source: ${financeName ?? 'Linked'}'
                        else
                          'Investment: Unlinked',
                        'Sources: ${sources.length}',
                      ].join('\n'),
                      style: _numStyle(
                        size: 11.5,
                        weight: FontWeight.w600,
                        height: 1.65,
                        letterSpacing: 0,
                      ),
                    ),
                  ],
                ),
              ),
              if (canOffset || tx['isOffset'] == true) ...[
                const SizedBox(height: 12),
                BrutalCard(
                  border: 2.5,
                  shadow: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 8,
                    children: [
                      Text(
                        offset != null ? offsetType : 'Offset this transaction',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      if (offset != null && offset['purpose'] != offsetType)
                        Text('${offset['purpose']}'),
                      for (final counterEntry in counterEntries)
                        Text(
                          "${counterEntry['type'] == 'INCOME' ? 'Incoming' : 'Outgoing'} · ${transactionDisplayName(counterEntry)} · ${inrPaise((counterEntry['amountPaise'] as num?) ?? 0)} · ${_fmtDate('${counterEntry['occurredAt']}')}",
                          style: FinStackType.caption,
                        ),
                      if (canOffset) ...[
                        const Text(
                          'Group incoming and outgoing entries that add up to the same amount.',
                        ),
                        _SheetButton(
                          label: 'Find matching transaction',
                          icon: Icons.swap_horiz,
                          onPressed: busy ? null : () => _offset(tx as Map),
                        ),
                      ] else if (canEdit && offset != null)
                        TextButton(
                          onPressed: busy ? null : _removeOffset,
                          child: const Text('Remove offset'),
                        ),
                    ],
                  ),
                ),
              ],
              if (canEdit && status == 'PENDING_REVIEW') ...[
                const SizedBox(height: 12),
                BrutalCard(
                  color: FinStackColors.errorContainer,
                  border: 2.5,
                  shadow: 3,
                  padding: const EdgeInsets.all(13),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'POSSIBLE DUPLICATE',
                        style: _labelStyle(
                          color: FinStackColors.onErrorContainer,
                          letterSpacing: 0.7,
                        ),
                      ),
                      const SizedBox(height: 10),
                      _SheetButton(
                        label: 'Merge duplicate',
                        onPressed: busy ? null : () => resolve('merge'),
                      ),
                      const SizedBox(height: 9),
                      _SheetButton(
                        label: 'Keep separate',
                        color: Colors.white,
                        onPressed: busy ? null : () => resolve('keepSeparate'),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
