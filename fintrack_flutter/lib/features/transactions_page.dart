import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';

const _allCategories = [
  'Groceries',
  'Food',
  'Electricity',
  'Rent',
  'Transportation',
  'Shopping',
  'Medical',
  'Education',
  'Entertainment',
  'Bills',
  'Household',
  'Proxy',
  'Family',
  'Internal Transfer',
  'Other',
];

const _pageSize = 50;

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
  const TransactionsPage({super.key, this.refresh = 0});
  final int refresh;
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
  String modeFilter = '';
  String statusFilter = '';
  String categoryFilter = '';

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    load();
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

  Future<void> _fetch({required bool reset, required int version}) async {
    try {
      final nextPage = reset ? 1 : page + 1;
      final qp = <String, dynamic>{
        'familyView': familyView,
        'page': nextPage,
        'limit': _pageSize,
      };
      final (from, to) = _dateRange;
      if (from != null) qp['from'] = from.toUtc().toIso8601String();
      if (to != null) {
        final nextDay = DateTime(to.year, to.month, to.day + 1);
        qp['to'] = nextDay
            .subtract(const Duration(milliseconds: 1))
            .toUtc()
            .toIso8601String();
      }
      if (modeFilter.isNotEmpty) qp['mode'] = modeFilter;
      if (statusFilter.isNotEmpty) qp['status'] = statusFilter;
      if (categoryFilter.isNotEmpty) qp['category'] = categoryFilter;
      if (vendorCtrl.text.trim().isNotEmpty) {
        qp['vendor'] = vendorCtrl.text.trim();
      }

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
          '${t['type'] ?? ''} ${t['category'] ?? ''} ${t['mode'] ?? ''} ${t['status'] ?? ''} ${t['recipient']?['name'] ?? ''} ${t['productName'] ?? ''}'
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
      _Period.custom =>
        '${dates.formatShortDate(from!)} – ${dates.formatShortDate(to!)}',
    };
  }

  Future<void> _openFilters() async {
    dismissKeyboard(context);
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (sheetContext) => _FiltersSheet(
        period: period,
        fromDate: _dateRange.$1,
        toDate: _dateRange.$2,
        mode: modeFilter,
        status: statusFilter,
        category: categoryFilter,
        vendor: vendorCtrl.text,
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      period = result['period'] as _Period;
      fromDate = result['from'] as DateTime?;
      toDate = result['to'] as DateTime?;
      modeFilter = '${result['mode'] ?? ''}';
      statusFilter = '${result['status'] ?? ''}';
      categoryFilter = '${result['category'] ?? ''}';
      vendorCtrl.text = '${result['vendor'] ?? ''}';
    });
    load();
  }

  List<String> get _filters => [
    if (modeFilter.isNotEmpty) modeFilter,
    if (statusFilter.isNotEmpty) _filterStatuses[statusFilter]!,
    if (categoryFilter.isNotEmpty) categoryFilter,
    if (vendorCtrl.text.trim().isNotEmpty) vendorCtrl.text.trim(),
  ];

  void _clearFilters() {
    dismissKeyboard(context);
    setState(() {
      modeFilter = '';
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
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (_) => const _AddTransactionSheet(),
    );
    if (added == true) load();
  }

  void _showDetail(Map<String, dynamic> txn) {
    dismissKeyboard(context);
    final id = '${txn['_id'] ?? txn['id']}';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TxDetailSheet(id: id, onChanged: load),
    );
  }

  @override
  Widget build(BuildContext context) {
    final list = loading ? <Map<String, dynamic>>[] : filtered;
    final headers = _headers(list);
    return Stack(
      children: [
        RefreshIndicator(
          color: FinStackColors.onSurface,
          backgroundColor: FinStackColors.brandYellow,
          onRefresh: load,
          child: ListView.builder(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 92),
            itemCount: headers.length + list.length + 1,
            itemBuilder: (context, index) {
              if (index < headers.length) return headers[index];
              final i = index - headers.length;
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
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
            onPressed: _openAdd,
          ),
        ),
      ],
    );
  }

  List<Widget> _headers(List<Map<String, dynamic>> list) {
    final actual = ((summary['actualExpenditurePaise'] ?? 0) as num) / 100;
    final movement = ((summary['totalMovementPaise'] ?? 0) as num) / 100;
    return [
      Row(
        children: [
          Expanded(
            child: Semantics(
              selected: !familyView,
              child: OutlinedButton(
                style: _filterButtonStyle(
                  familyView ? Colors.white : FinStackColors.brandYellow,
                ),
                onPressed: () {
                  if (!familyView) return;
                  setState(() => familyView = false);
                  load();
                },
                child: const Text('My activity'),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Semantics(
              selected: familyView,
              child: OutlinedButton(
                style: _filterButtonStyle(
                  familyView ? FinStackColors.brandYellow : Colors.white,
                ),
                onPressed: () {
                  if (familyView) return;
                  setState(() => familyView = true);
                  load();
                },
                child: const Text('Family'),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 10),
      BrutalCard(
        color: FinStackColors.surfaceContainer,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      _periodTitle(context),
                      style: const TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  style: _filterButtonStyle(
                    _filters.isEmpty
                        ? Colors.white
                        : FinStackColors.brandYellow,
                  ),
                  onPressed: _openFilters,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.tune, size: 17),
                      const SizedBox(width: 6),
                      Text(
                        _filters.isEmpty
                            ? 'Filters'
                            : 'Filters (${_filters.length})',
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (!loading && (error == null || items.isNotEmpty)) ...[
              Text('$total transaction${total == 1 ? '' : 's'}'),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _StatTile(label: 'Spent', value: inr(actual)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _StatTile(label: 'Movement', value: inr(movement)),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 12),
      if (_filters.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'Filtered by ${_filters.join(' · ')}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      if (items.isNotEmpty || searchCtrl.text.isNotEmpty) ...[
        TextField(
          controller: searchCtrl,
          onChanged: (_) => setState(() {}),
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search loaded transactions',
            prefixIcon: const Icon(Icons.search, size: 20),
            suffixIcon: searchCtrl.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear search',
                    onPressed: () => setState(searchCtrl.clear),
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 12),
      ],
      if (loading)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: LinearProgressIndicator(
            semanticsLabel: 'Loading transactions',
          ),
        )
      else if (error != null && items.isEmpty)
        BrutalCard(
          color: FinStackColors.errorContainer,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                error!,
                style: const TextStyle(
                  color: FinStackColors.onErrorContainer,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              BrutalButton(
                label: 'Retry',
                icon: Icons.refresh,
                onPressed: load,
              ),
            ],
          ),
        )
      else if (list.isEmpty)
        _emptyState(),
    ];
  }

  Widget _emptyState() {
    final hasSearch = items.isNotEmpty && searchCtrl.text.trim().isNotEmpty;
    final hasFilters = _filters.isNotEmpty;
    final currentMonth = period == _Period.thisMonth;
    final month = MaterialLocalizations.of(context).formatMonthYear(_today);
    return BrutalEmpty(
      icon: Icons.receipt_long_outlined,
      message: hasSearch
          ? 'No matches in the loaded transactions.'
          : hasFilters
          ? 'No transactions match the filters for this period.'
          : currentMonth
          ? 'No transactions in $month so far. You can check the previous month.'
          : period == _Period.allTime
          ? 'No transactions yet. Scan a QR or add one to get started.'
          : 'No transactions for ${_periodTitle(context)}.',
      action: hasSearch
          ? BrutalButton(
              label: 'Clear search',
              onPressed: () => setState(searchCtrl.clear),
            )
          : hasFilters
          ? BrutalButton(label: 'Clear filters', onPressed: _clearFilters)
          : currentMonth
          ? BrutalButton(
              label: 'View previous month',
              icon: Icons.arrow_back,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              onPressed: () => _selectPeriod(_Period.previousMonth),
            )
          : period == _Period.allTime
          ? null
          : BrutalButton(
              label: 'Back to this month',
              icon: Icons.calendar_today_outlined,
              onPressed: () => _selectPeriod(_Period.thisMonth),
            ),
    );
  }

  Widget _dayHeader(String? iso) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 6),
    child: Row(
      children: [
        Container(width: 8, height: 14, color: FinStackColors.brandYellow),
        const SizedBox(width: 8),
        Text(
          _dayLabel(iso).toUpperCase(),
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
            color: FinStackColors.onSurfaceVariant,
          ),
        ),
      ],
    ),
  );

  Widget _txnCard(Map<String, dynamic> t) {
    final type = '${t['type'] ?? ''}';
    final isIncome = type == 'INCOME';
    final paise = ((t['amountPaise'] ?? 0) as num) / 100;
    final vendor =
        '${t['recipient']?['name'] ?? t['productName'] ?? t['category'] ?? 'Transaction'}';
    final status = '${t['status'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: () => _showDetail(t),
        child: Container(
          decoration: brutal(shadow: 3),
          padding: const EdgeInsets.all(12),
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
              const SizedBox(width: 10),
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
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${t['category'] ?? ''} · ${t['mode'] ?? ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: FinStackColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    inr(paise),
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                      color: isIncome
                          ? FinStackColors.onTertiaryContainer
                          : FinStackColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 3),
                  BrutalTag(
                    label: status.isEmpty ? type : status.replaceAll('_', ' '),
                    color: status == 'RECONCILED'
                        ? FinStackColors.tertiary
                        : status == 'PENDING_REVIEW'
                        ? FinStackColors.errorContainer
                        : Colors.white,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _footer(List<Map<String, dynamic>> list) {
    if (loading) return const SizedBox.shrink();
    if (loadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 8),
            Text(
              'Loading more…',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      );
    }
    if (items.isEmpty) return const SizedBox(height: 20);
    if (hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Center(
          child: Column(
            children: [
              if (error != null) ...[Text(error!), const SizedBox(height: 8)],
              BrutalButton(
                label: error == null ? 'Load more' : 'Retry loading more',
                icon: error == null ? Icons.expand_more : Icons.refresh,
                onPressed: _loadMore,
              ),
            ],
          ),
        ),
      );
    }
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      decoration: BoxDecoration(
        border: Border.all(color: FinStackColors.onSurface, width: 2),
        color: FinStackColors.surfaceContainer,
      ),
      child: Column(
        children: [
          Text(
            list.length == total
                ? 'All $total transactions loaded'
                : '${list.length} of $total shown',
            style: const TextStyle(fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  const _StatTile({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Container(
    decoration: brutal(border: 2, shadow: 2, color: Colors.white),
    padding: const EdgeInsets.all(8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 3),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
        ),
      ],
    ),
  );
}

const _filterStatuses = {
  'PENDING_REVIEW': 'Needs review',
  'ACTIVE': 'Active',
  'RECONCILED': 'Reconciled',
};

ButtonStyle _filterButtonStyle(Color background) => OutlinedButton.styleFrom(
  minimumSize: const Size(48, 48),
  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
  backgroundColor: background,
  foregroundColor: FinStackColors.onSurface,
  side: const BorderSide(color: FinStackColors.onSurface, width: 2),
  shape: const RoundedRectangleBorder(),
);

class _FiltersSheet extends StatefulWidget {
  final _Period period;
  final DateTime? fromDate;
  final DateTime? toDate;
  final String mode;
  final String status;
  final String category;
  final String vendor;
  const _FiltersSheet({
    required this.period,
    this.fromDate,
    this.toDate,
    required this.mode,
    required this.status,
    required this.category,
    required this.vendor,
  });

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late _Period period = widget.period;
  late DateTime from = widget.fromDate ?? DateTime(_today.year, _today.month);
  late DateTime to = widget.toDate ?? _today;
  final _today = DateUtils.dateOnly(DateTime.now());
  late String mode = widget.mode;
  late String status = widget.status;
  late String category = widget.category;
  late final TextEditingController vendorCtrl = TextEditingController(
    text: widget.vendor,
  );

  @override
  void dispose() {
    vendorCtrl.dispose();
    super.dispose();
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
      'mode': reset ? '' : mode,
      'status': reset ? '' : status,
      'category': reset ? '' : category,
      'vendor': reset ? '' : vendorCtrl.text.trim(),
    });
  }

  Widget _dropdown(
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> onChanged,
  ) => DropdownButtonFormField<String>(
    isExpanded: true,
    initialValue: value,
    decoration: InputDecoration(labelText: label),
    items: [
      for (final entry in options.entries)
        DropdownMenuItem(value: entry.key, child: Text(entry.value)),
    ],
    onChanged: (value) {
      if (value != null) setState(() => onChanged(value));
    },
  );

  @override
  Widget build(BuildContext context) {
    final dates = MaterialLocalizations.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Semantics(
                      header: true,
                      child: const Text(
                        'Filter transactions',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close filters',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _dropdown(
                'Date range',
                period.name,
                {
                  for (final option in _Period.values)
                    option.name: option.label,
                },
                (value) => period = _Period.values.byName(value),
              ),
              if (period == _Period.custom) ...[
                const SizedBox(height: 10),
                OutlinedButton(
                  style: _filterButtonStyle(Colors.white),
                  onPressed: () => _pick(true),
                  child: Text('From ${dates.formatShortDate(from)}'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  style: _filterButtonStyle(Colors.white),
                  onPressed: () => _pick(false),
                  child: Text('Through ${dates.formatShortDate(to)}'),
                ),
              ],
              const SizedBox(height: 12),
              _dropdown('Payment method', mode, const {
                '': 'Any method',
                'UPI': 'UPI',
                'BANK': 'Bank',
                'CASH': 'Cash',
                'CARD': 'Card',
                'OTHER': 'Other',
              }, (value) => mode = value),
              const SizedBox(height: 12),
              _dropdown('Status', status, const {
                '': 'Any status',
                ..._filterStatuses,
              }, (value) => status = value),
              const SizedBox(height: 12),
              _dropdown('Category', category, {
                '': 'Any category',
                for (final name in _allCategories) name: name,
              }, (value) => category = value),
              const SizedBox(height: 12),
              TextField(
                controller: vendorCtrl,
                decoration: const InputDecoration(
                  labelText: 'Vendor',
                  hintText: 'Merchant name or UPI ID',
                ),
                textInputAction: TextInputAction.done,
              ),
              const SizedBox(height: 18),
              OutlinedButton(
                style: _filterButtonStyle(FinStackColors.brandYellow),
                onPressed: _apply,
                child: const Text('Apply filters'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                style: _filterButtonStyle(Colors.white),
                onPressed: () => _apply(reset: true),
                child: const Text('Reset to this month'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddTransactionSheet extends StatefulWidget {
  const _AddTransactionSheet();
  @override
  State<_AddTransactionSheet> createState() => _AddTransactionSheetState();
}

class _AddTransactionSheetState extends State<_AddTransactionSheet> {
  final amountCtrl = TextEditingController();
  final recipientCtrl = TextEditingController();
  String type = 'EXPENSE';
  String mode = 'UPI';
  String category = 'Other';
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
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: BrutalTag(
                label: 'Manual entry',
                color: FinStackColors.brandYellow,
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'ADD TRANSACTION',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 14),
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
            const SizedBox(height: 10),
            BrutalField(
              label: 'Recipient (optional)',
              controller: recipientCtrl,
              hint: 'Merchant or person',
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: type,
              decoration: const InputDecoration(),
              items: const [
                'EXPENSE',
                'INCOME',
                'INTERNAL_TRANSFER',
                'CASH_WITHDRAWAL',
                'CASH_EXPENSE',
              ].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (v) => setState(() => type = v ?? 'EXPENSE'),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: mode,
              decoration: const InputDecoration(),
              items: const [
                'UPI',
                'BANK',
                'CASH',
                'CARD',
                'OTHER',
              ].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (v) => setState(() => mode = v ?? 'UPI'),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: category,
              decoration: const InputDecoration(),
              items: _allCategories
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) => setState(() => category = v ?? 'Other'),
            ),
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(
                error!,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: FinStackColors.onErrorContainer,
                ),
              ),
            ],
            const SizedBox(height: 16),
            BrutalButton(
              block: true,
              label: adding ? 'Adding…' : 'Add transaction',
              icon: Icons.add,
              onPressed: adding ? null : add,
            ),
            const SizedBox(height: 8),
            BrutalButton(
              block: true,
              color: Colors.white,
              label: 'Cancel',
              onPressed: adding ? null : () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}

/// Detail sheet mirrors website drawer: GET /transactions/:id,
/// editable category, visibility toggle, resolve actions.
class _TxDetailSheet extends StatefulWidget {
  final String id;
  final VoidCallback onChanged;
  const _TxDetailSheet({required this.id, required this.onChanged});
  @override
  State<_TxDetailSheet> createState() => _TxDetailSheetState();
}

class _TxDetailSheetState extends State<_TxDetailSheet> {
  Map? detail;
  bool loading = true;
  String? editCategory;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    fetch();
  }

  Future<void> fetch() async {
    try {
      final res = await ApiClient.dio.get('/transactions/${widget.id}');
      if (!mounted) return;
      setState(() {
        detail = res.data;
        editCategory =
            (res.data['transaction']?['category'] ?? 'Other') as String;
      });
    } catch (_) {
      if (mounted) setState(() => detail = {});
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
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Update failed.')));
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
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Resolve failed.')));
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
      initialChildSize: 0.85,
      builder: (_, ctrl) {
        if (loading) {
          return const BrutalLoading(label: 'Loading transaction', cards: 2);
        }
        if (tx == null) {
          return const Center(child: Text('Could not load transaction.'));
        }
        final paise = ((tx['amountPaise'] ?? 0) as num).toDouble();
        final vis = '${tx['visibility'] ?? 'FAMILY'}';
        final status = '${tx['status'] ?? ''}';
        final sources = (detail?['sources'] as List?) ?? [];
        return ListView(
          controller: ctrl,
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '₹${(paise / 100).toStringAsFixed(0)} · ${tx['type'] ?? ''}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            Text(
              '${_fmtDate('${tx['occurredAt'] ?? ''}')} · ${tx['mode'] ?? ''} · $status',
              style: const TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 12),
            BrutalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'CATEGORY',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                  ),
                  DropdownButton<String>(
                    value: _allCategories.contains(editCategory)
                        ? editCategory
                        : 'Other',
                    isExpanded: true,
                    items: _allCategories
                        .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                        .toList(),
                    onChanged: (v) => setState(() => editCategory = v),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: BrutalButton(
                      label: busy ? '…' : 'Save category',
                      onPressed: busy
                          ? null
                          : () => patch({'category': editCategory}),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            BrutalCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'VISIBILITY',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        vis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const Text(
                        'Private is hidden from other members.',
                        style: TextStyle(fontSize: 10),
                      ),
                    ],
                  ),
                  BrutalButton(
                    label: vis == 'PRIVATE' ? 'Make Family' : 'Make Private',
                    onPressed: busy
                        ? null
                        : () => patch({
                            'visibility': vis == 'PRIVATE'
                                ? 'FAMILY'
                                : 'PRIVATE',
                          }),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            BrutalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'LINKS',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    'Recipient: ${tx['recipient']?['name'] ?? '—'}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  Text(
                    'UPI: ${tx['upiId'] ?? detail?['sources']?[0]?['upiId'] ?? '—'}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  Text(
                    'UTR: ${tx['utr'] ?? detail?['sources']?[0]?['utr'] ?? '—'}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (tx['subscriptionRef'] != null)
                    Text(
                      'Subscription: ${tx['subscriptionRef'] is Map ? tx['subscriptionRef']['name'] : 'linked'}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  Text(
                    'Sources: ${sources.length}',
                    style: const TextStyle(fontSize: 11),
                  ),
                ],
              ),
            ),
            if (status == 'PENDING_REVIEW') ...[
              const SizedBox(height: 8),
              BrutalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'POSSIBLE DUPLICATE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    BrutalButton(
                      label: 'Merge duplicate',
                      onPressed: busy ? null : () => resolve('merge'),
                    ),
                    const SizedBox(height: 8),
                    BrutalButton(
                      label: 'Keep separate',
                      onPressed: busy ? null : () => resolve('keepSeparate'),
                    ),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
