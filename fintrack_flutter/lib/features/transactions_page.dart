import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

const _allCategories = ['Groceries', 'Food', 'Electricity', 'Rent', 'Transportation', 'Shopping', 'Medical', 'Education', 'Entertainment', 'Bills', 'Household', 'Proxy', 'Family', 'Internal Transfer', 'Other'];

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

class TransactionsPage extends StatefulWidget {
  const TransactionsPage({super.key});
  @override
  State<TransactionsPage> createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {
  bool familyView = false;
  List items = [];
  Map summary = {};
  bool loading = true;
  final amountCtrl = TextEditingController();
  String type = 'EXPENSE';
  String mode = 'UPI';
  String category = 'Other';
  final recipientCtrl = TextEditingController();
  final vendorCtrl = TextEditingController();
  final searchCtrl = TextEditingController();
  DateTime? fromDate;
  DateTime? toDate;
  String modeFilter = '';
  String statusFilter = '';
  String categoryFilter = '';

  @override
  void initState() {
    super.initState();
    load();
  }

  String _d(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void setThisMonth() {
    final now = DateTime.now();
    setState(() {
      fromDate = DateTime(now.year, now.month, 1);
      toDate = DateTime(now.year, now.month + 1, 0);
    });
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final qp = <String, dynamic>{'familyView': familyView};
      if (fromDate != null) qp['from'] = _d(fromDate!);
      if (toDate != null) qp['to'] = _d(toDate!);
      if (modeFilter.isNotEmpty) qp['mode'] = modeFilter;
      if (statusFilter.isNotEmpty) qp['status'] = statusFilter;
      if (categoryFilter.isNotEmpty) qp['category'] = categoryFilter;
      if (vendorCtrl.text.trim().isNotEmpty) qp['vendor'] = vendorCtrl.text.trim();
      final res = await ApiClient.dio.get('/transactions', queryParameters: qp);
      setState(() {
        items = res.data['items'] ?? res.data ?? [];
        summary = res.data['summary'] ?? {};
      });
    } catch (e) {
      /* ignore */
    }
    if (mounted) setState(() => loading = false);
  }

  List get filtered {
    final q = searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((t) {
      final hay = '${t['type'] ?? ''} ${t['category'] ?? ''} ${t['mode'] ?? ''} ${t['status'] ?? ''} ${t['recipient']?['name'] ?? ''}'.toLowerCase();
      return hay.contains(q);
    }).toList();
  }

  Future<void> add() async {
    final paise = (double.tryParse(amountCtrl.text) ?? 0) * 100;
    if (paise <= 0) return;
    await ApiClient.dio.post('/transactions', data: {
      'amountPaise': paise.round(),
      'type': type,
      'mode': mode,
      'category': category,
      'occurredAt': DateTime.now().toIso8601String(),
      'recipient': recipientCtrl.text.isNotEmpty ? {'name': recipientCtrl.text} : null,
    });
    amountCtrl.clear();
    recipientCtrl.clear();
    await load();
  }

  void showDetail(Map txn) {
    final id = '${txn['_id'] ?? txn['id']}';
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _TxDetailSheet(id: id, onChanged: load));
  }

  @override
  Widget build(BuildContext context) {
    final list = filtered;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Row(children: [
        Expanded(child: BrutalButton(label: 'My', onPressed: () { setState(() => familyView = false); load(); })),
        const SizedBox(width: 8),
        Expanded(child: BrutalButton(label: 'Family', onPressed: () { setState(() => familyView = true); load(); })),
      ]),
      const SizedBox(height: 8),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('FILTERS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        TextField(controller: searchCtrl, decoration: const InputDecoration(hintText: 'Search type, category, vendor…'),
          onChanged: (_) => setState(() {})),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: TextField(controller: vendorCtrl, decoration: const InputDecoration(hintText: 'Vendor'))),
          const SizedBox(width: 8),
          Expanded(child: DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: modeFilter.isEmpty ? null : modeFilter,
            hint: const Text('Mode'),
            items: const ['UPI', 'BANK', 'CASH', 'CARD', 'OTHER'].map((e) => DropdownMenuItem(value: e, child: Text(e, style: TextStyle(fontSize: 12)))).toList(),
            onChanged: (v) => setState(() => modeFilter = v ?? ''),
          )),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: statusFilter.isEmpty ? null : statusFilter,
            hint: const Text('Status', style: TextStyle(fontSize: 12)),
            items: const ['PENDING_REVIEW', 'ACTIVE', 'RECONCILED'].map((e) => DropdownMenuItem(value: e, child: Text(e, style: TextStyle(fontSize: 11)))).toList(),
            onChanged: (v) => setState(() => statusFilter = v ?? ''),
          )),
          const SizedBox(width: 8),
          Expanded(child: DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: categoryFilter.isEmpty ? null : categoryFilter,
            hint: const Text('Category', style: TextStyle(fontSize: 12)),
            items: _allCategories.map((e) => DropdownMenuItem(value: e, child: Text(e, style: TextStyle(fontSize: 11)))).toList(),
            onChanged: (v) => setState(() => categoryFilter = v ?? ''),
          )),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: OutlinedButton(
            onPressed: () async {
              final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(2030), initialDate: fromDate ?? DateTime.now());
              if (d != null) setState(() => fromDate = d);
            },
            child: Text(fromDate == null ? 'From' : _d(fromDate!), style: const TextStyle(fontSize: 12)),
          )),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton(
            onPressed: () async {
              final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(2030), initialDate: toDate ?? DateTime.now());
              if (d != null) setState(() => toDate = d);
            },
            child: Text(toDate == null ? 'To' : _d(toDate!), style: const TextStyle(fontSize: 12)),
          )),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          BrutalButton(label: 'This Month', onPressed: setThisMonth),
          if (fromDate != null || toDate != null)
            BrutalButton(label: '✕ Dates', onPressed: () { setState(() { fromDate = null; toDate = null; }); load(); }),
          BrutalButton(label: 'Apply', onPressed: load),
          BrutalButton(label: 'Clear', onPressed: () {
            vendorCtrl.clear(); searchCtrl.clear();
            setState(() { fromDate = null; toDate = null; modeFilter = ''; statusFilter = ''; categoryFilter = ''; });
            load();
          }),
        ]),
      ])),
      const SizedBox(height: 12),
      if (summary.isNotEmpty)
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Stat(label: 'Actual', value: '₹${((summary['actualExpenditurePaise'] ?? 0) / 100).toStringAsFixed(0)}'),
          _Stat(label: 'Transfers', value: '₹${((summary['internalTransfersPaise'] ?? 0) / 100).toStringAsFixed(0)}'),
          _Stat(label: 'Withdrawals', value: '₹${((summary['cashWithdrawalsPaise'] ?? 0) / 100).toStringAsFixed(0)}'),
          _Stat(label: 'Movement', value: '₹${((summary['totalMovementPaise'] ?? 0) / 100).toStringAsFixed(0)}'),
        ]),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('ADD TRANSACTION', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: TextField(controller: amountCtrl, decoration: const InputDecoration(hintText: 'Amount ₹'), keyboardType: TextInputType.number)),
          const SizedBox(width: 8),
          Expanded(child: DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: type, decoration: const InputDecoration(),
            items: const ['EXPENSE', 'INCOME', 'INTERNAL_TRANSFER', 'CASH_WITHDRAWAL', 'CASH_EXPENSE']
                .map((e) => DropdownMenuItem(value: e, child: Text(e, style: TextStyle(fontSize: 11)))).toList(),
            onChanged: (v) => setState(() => type = v!),
          )),
        ]),
        const SizedBox(height: 8),
        TextField(controller: recipientCtrl, decoration: const InputDecoration(hintText: 'Recipient (optional)')),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: BrutalButton(label: '+ Add', onPressed: add)),
      ])),
      const SizedBox(height: 12),
      if (loading) const Center(child: CircularProgressIndicator())
      else if (list.isEmpty) const BrutalCard(child: Text('No transactions yet.'))
      else ...list.map((t) => GestureDetector(
        onTap: () => showDetail(Map<String, dynamic>.from(t)),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: brutal(),
          padding: const EdgeInsets.all(12),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${t['type'] ?? ''} · ${_fmtDate('${t['occurredAt'] ?? ''}')}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
              Text('${t['category'] ?? ''}${t['recipient']?['name'] != null ? ' · ${t['recipient']['name']}' : ''}',
                style: const TextStyle(fontSize: 11, color: FinStackColors.onSurfaceVariant), overflow: TextOverflow.ellipsis),
              Text('${t['mode'] ?? ''} · ${t['status'] ?? ''}', style: const TextStyle(fontSize: 10)),
            ])),
            const SizedBox(width: 8),
            Text('₹${((t['amountPaise'] ?? 0) / 100).toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
        ),
      )),
    ]);
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
        editCategory = (res.data['transaction']?['category'] ?? 'Other') as String;
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Update failed.')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resolve(String action) async {
    setState(() => busy = true);
    try {
      final tx = detail?['transaction'];
      await ApiClient.dio.post('/transactions/${widget.id}/resolve',
        data: {'action': action, if (action == 'merge' && tx?['candidateOf'] != null) 'targetId': tx!['candidateOf']});
      if (mounted) Navigator.pop(context);
      widget.onChanged();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Resolve failed.')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tx = detail?['transaction'];
    return DraggableScrollableSheet(expand: false, initialChildSize: 0.85, builder: (_, ctrl) {
      if (loading) return const Center(child: CircularProgressIndicator());
      if (tx == null) return const Center(child: Text('Could not load transaction.'));
      final paise = ((tx['amountPaise'] ?? 0) as num).toDouble();
      final vis = '${tx['visibility'] ?? 'FAMILY'}';
      final status = '${tx['status'] ?? ''}';
      final sources = (detail?['sources'] as List?) ?? [];
      return ListView(controller: ctrl, padding: const EdgeInsets.all(16), children: [
        Text('₹${(paise / 100).toStringAsFixed(0)} · ${tx['type'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
        Text('${_fmtDate('${tx['occurredAt'] ?? ''}')} · ${tx['mode'] ?? ''} · $status', style: const TextStyle(fontSize: 12)),
        const SizedBox(height: 12),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('CATEGORY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          DropdownButton<String>(value: _allCategories.contains(editCategory) ? editCategory : 'Other', isExpanded: true,
            items: _allCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
            onChanged: (v) => setState(() => editCategory = v)),
          Align(alignment: Alignment.centerRight,
            child: BrutalButton(label: busy ? '…' : 'Save category', onPressed: busy ? null : () => patch({'category': editCategory}))),
        ])),
        const SizedBox(height: 8),
        BrutalCard(child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('VISIBILITY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            Text(vis, style: const TextStyle(fontWeight: FontWeight.w700)),
            const Text('Private is hidden from other members.', style: TextStyle(fontSize: 10)),
          ]),
          BrutalButton(label: vis == 'PRIVATE' ? 'Make Family' : 'Make Private',
            onPressed: busy ? null : () => patch({'visibility': vis == 'PRIVATE' ? 'FAMILY' : 'PRIVATE'})),
        ])),
        const SizedBox(height: 8),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('LINKS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          Text('Recipient: ${tx['recipient']?['name'] ?? '—'}', style: const TextStyle(fontSize: 12)),
          Text('UPI: ${tx['upiId'] ?? detail?['sources']?[0]?['upiId'] ?? '—'}', style: const TextStyle(fontSize: 12)),
          Text('UTR: ${tx['utr'] ?? detail?['sources']?[0]?['utr'] ?? '—'}', style: const TextStyle(fontSize: 12)),
          if (tx['subscriptionRef'] != null) Text('Subscription: ${tx['subscriptionRef'] is Map ? tx['subscriptionRef']['name'] : 'linked'}',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          if (tx['loanRef'] != null) Text('Loan: ${tx['loanRef'] is Map ? (tx['loanRef']['loanName'] ?? 'linked') : 'linked'}${tx['loanMeta']?['isPrepayment'] == true ? ' (Prepayment)' : ' (EMI)'}',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          Text('Sources: ${sources.length}', style: const TextStyle(fontSize: 11)),
        ])),
        if (status == 'PENDING_REVIEW') ...[
          const SizedBox(height: 8),
          BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('POSSIBLE DUPLICATE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            BrutalButton(label: 'Merge duplicate', onPressed: busy ? null : () => resolve('merge')),
            const SizedBox(height: 8),
            BrutalButton(label: 'Keep separate', onPressed: busy ? null : () => resolve('keepSeparate')),
          ])),
        ],
      ]);
    });
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  const _Stat({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Container(
    decoration: brutal(border: 2, shadow: 2),
    padding: const EdgeInsets.all(10),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
      const SizedBox(height: 4),
      Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
    ]),
  );
}
