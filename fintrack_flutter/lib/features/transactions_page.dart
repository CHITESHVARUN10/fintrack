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

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

String _dayLabel(String? iso) {
  final d = DateTime.tryParse(iso ?? '');
  if (d == null) return 'Unknown date';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  final diff = today.difference(day).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  return _fmtDate(iso);
}

bool _sameDay(String? a, String? b) {
  final da = DateTime.tryParse(a ?? '');
  final db = DateTime.tryParse(b ?? '');
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
  const TransactionsPage({super.key});
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
  void dispose() {
    _scroll.dispose();
    searchCtrl.dispose();
    vendorCtrl.dispose();
    super.dispose();
  }

  String _d(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 420) {
      _loadMore();
    }
  }

  Future<void> load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
      page = 0;
      hasMore = true;
    });
    await _fetch(reset: true);
  }

  Future<void> _loadMore() async {
    if (loading || loadingMore || !hasMore) return;
    setState(() => loadingMore = true);
    await _fetch(reset: false);
    if (mounted) setState(() => loadingMore = false);
  }

  Future<void> _fetch({required bool reset}) async {
    try {
      final nextPage = reset ? 1 : page + 1;
      final qp = <String, dynamic>{
        'familyView': familyView,
        'page': nextPage,
        'limit': _pageSize,
      };
      if (fromDate != null) qp['from'] = _d(fromDate!);
      if (toDate != null) qp['to'] = _d(toDate!);
      if (modeFilter.isNotEmpty) qp['mode'] = modeFilter;
      if (statusFilter.isNotEmpty) qp['status'] = statusFilter;
      if (categoryFilter.isNotEmpty) qp['category'] = categoryFilter;
      if (vendorCtrl.text.trim().isNotEmpty)
        qp['vendor'] = vendorCtrl.text.trim();

      final res = await ApiClient.dio.get('/transactions', queryParameters: qp);
      if (!mounted) return;
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
        summary = res.data['summary'] ?? (reset ? {} : summary);
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => error = items.isEmpty
              ? 'Could not load transactions. Check your connection and retry.'
              : null,
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
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

  void setThisMonth() {
    final now = DateTime.now();
    setState(() {
      fromDate = DateTime(now.year, now.month, 1);
      toDate = DateTime(now.year, now.month + 1, 0);
    });
    load();
  }

  Future<void> _openFilters() async {
    dismissKeyboard(context);
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (sheetContext) => _FiltersSheet(
        fromDate: fromDate,
        toDate: toDate,
        mode: modeFilter,
        status: statusFilter,
        category: categoryFilter,
        vendor: vendorCtrl.text,
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      fromDate = result['from'] as DateTime?;
      toDate = result['to'] as DateTime?;
      modeFilter = '${result['mode'] ?? ''}';
      statusFilter = '${result['status'] ?? ''}';
      categoryFilter = '${result['category'] ?? ''}';
      vendorCtrl.text = '${result['vendor'] ?? ''}';
    });
    load();
  }

  bool get _hasFilters =>
      fromDate != null ||
      toDate != null ||
      modeFilter.isNotEmpty ||
      statusFilter.isNotEmpty ||
      categoryFilter.isNotEmpty ||
      vendorCtrl.text.trim().isNotEmpty;

  void _clearFilters() {
    setState(() {
      fromDate = null;
      toDate = null;
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
    if (loading) {
      return const BrutalLoading(label: 'Loading transactions', cards: 5);
    }
    final list = filtered;
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
            child: BrutalButton(
              block: true,
              label: 'My',
              color: familyView ? Colors.white : FinStackColors.brandYellow,
              onPressed: () {
                if (familyView) {
                  setState(() => familyView = false);
                  load();
                }
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: BrutalButton(
              block: true,
              label: 'Family',
              color: familyView ? FinStackColors.brandYellow : Colors.white,
              onPressed: () {
                if (!familyView) {
                  setState(() => familyView = true);
                  load();
                }
              },
            ),
          ),
        ],
      ),
      const SizedBox(height: 10),
      BrutalCard(
        color: FinStackColors.surfaceContainer,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const BrutalTag(label: 'Ledger', color: Colors.white),
                const Spacer(),
                Text(
                  loading ? '—' : '$total transaction${total == 1 ? '' : 's'}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _StatTile(label: 'Spent', value: inr(actual)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatTile(label: 'Movement', value: inr(movement)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatTile(label: 'Loaded', value: '${items.length}'),
                ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 10),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: searchCtrl,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                hintText: 'Search loaded transactions',
                prefixIcon: Icon(Icons.search, size: 18),
              ),
            ),
          ),
          const SizedBox(width: 8),
          BrutalIconButton(
            icon: Icons.tune,
            tooltip: 'Filters',
            color: _hasFilters ? FinStackColors.brandYellow : Colors.white,
            onPressed: _openFilters,
          ),
        ],
      ),
      if (_hasFilters) ...[
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (fromDate != null || toDate != null)
              GestureDetector(
                onTap: () {
                  setState(() {
                    fromDate = null;
                    toDate = null;
                  });
                  load();
                },
                child: BrutalTag(
                  label:
                      '${fromDate == null ? '…' : _fmtDate(_d(fromDate!))} → ${toDate == null ? '…' : _fmtDate(_d(toDate!))}  ✕',
                  color: FinStackColors.tertiary,
                ),
              ),
            if (modeFilter.isNotEmpty)
              GestureDetector(
                onTap: () {
                  setState(() => modeFilter = '');
                  load();
                },
                child: BrutalTag(label: '$modeFilter  ✕', color: Colors.white),
              ),
            if (statusFilter.isNotEmpty)
              GestureDetector(
                onTap: () {
                  setState(() => statusFilter = '');
                  load();
                },
                child: BrutalTag(
                  label: '$statusFilter  ✕',
                  color: Colors.white,
                ),
              ),
            if (categoryFilter.isNotEmpty)
              GestureDetector(
                onTap: () {
                  setState(() => categoryFilter = '');
                  load();
                },
                child: BrutalTag(
                  label: '$categoryFilter  ✕',
                  color: Colors.white,
                ),
              ),
            if (vendorCtrl.text.trim().isNotEmpty)
              GestureDetector(
                onTap: () {
                  setState(() => vendorCtrl.clear());
                  load();
                },
                child: BrutalTag(
                  label: '${vendorCtrl.text}  ✕',
                  color: Colors.white,
                ),
              ),
            GestureDetector(
              onTap: _clearFilters,
              child: const BrutalTag(
                label: 'Clear all',
                color: FinStackColors.brandYellow,
              ),
            ),
          ],
        ),
      ],
      const SizedBox(height: 10),
      if (error != null)
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
        BrutalEmpty(
          icon: Icons.receipt_long,
          message: _hasFilters
              ? 'No transactions match these filters. Clear them to see everything.'
              : 'No transactions yet. Scan a QR or add one to start your ledger.',
          action: _hasFilters
              ? BrutalButton(label: 'Clear filters', onPressed: _clearFilters)
              : null,
        ),
    ];
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
          child: BrutalButton(
            label: 'Load more',
            icon: Icons.expand_more,
            onPressed: _loadMore,
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
          const Text(
            'END OF LEDGER',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 4),
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
          style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w800),
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

class _FiltersSheet extends StatefulWidget {
  final DateTime? fromDate;
  final DateTime? toDate;
  final String mode;
  final String status;
  final String category;
  final String vendor;
  const _FiltersSheet({
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
  late DateTime? from = widget.fromDate;
  late DateTime? to = widget.toDate;
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
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      initialDate: (isFrom ? from : to) ?? DateTime.now(),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        from = picked;
      } else {
        to = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = (DateTime x) =>
        '${x.day.toString().padLeft(2, '0')}/${x.month.toString().padLeft(2, '0')}/${x.year}';
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
                label: 'Filters',
                color: FinStackColors.brandYellow,
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'NARROW YOUR LEDGER',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pick(true),
                    child: Text(
                      from == null ? 'From' : d(from!),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pick(false),
                    child: Text(
                      to == null ? 'To' : d(to!),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            BrutalField(
              label: 'Vendor',
              controller: vendorCtrl,
              hint: 'Merchant name or UPI ID',
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: mode.isEmpty ? null : mode,
              hint: const Text('Mode'),
              items: const [
                'UPI',
                'BANK',
                'CASH',
                'CARD',
                'OTHER',
              ].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (v) => setState(() => mode = v ?? ''),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: status.isEmpty ? null : status,
              hint: const Text('Status'),
              items: const [
                'PENDING_REVIEW',
                'ACTIVE',
                'RECONCILED',
              ].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (v) => setState(() => status = v ?? ''),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: category.isEmpty ? null : category,
              hint: const Text('Category'),
              items: _allCategories
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) => setState(() => category = v ?? ''),
            ),
            const SizedBox(height: 16),
            BrutalButton(
              block: true,
              label: 'Apply filters',
              icon: Icons.check,
              onPressed: () {
                dismissKeyboard(context);
                Navigator.of(context).pop({
                  'from': from,
                  'to': to,
                  'mode': mode,
                  'status': status,
                  'category': category,
                  'vendor': vendorCtrl.text.trim(),
                });
              },
            ),
            const SizedBox(height: 8),
            BrutalButton(
              block: true,
              color: Colors.white,
              label: 'Reset',
              onPressed: () {
                dismissKeyboard(context);
                Navigator.of(context).pop({
                  'from': null,
                  'to': null,
                  'mode': '',
                  'status': '',
                  'category': '',
                  'vendor': '',
                });
              },
            ),
          ],
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
          'occurredAt': DateTime.now().toIso8601String(),
          'recipient': recipientCtrl.text.trim().isNotEmpty
              ? {'name': recipientCtrl.text.trim()}
              : null,
        },
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted)
        setState(
          () => error =
              'Could not add the transaction. Check your connection and retry.',
        );
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
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Update failed.')));
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
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Resolve failed.')));
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
        if (loading)
          return const BrutalLoading(label: 'Loading transaction', cards: 2);
        if (tx == null)
          return const Center(child: Text('Could not load transaction.'));
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
