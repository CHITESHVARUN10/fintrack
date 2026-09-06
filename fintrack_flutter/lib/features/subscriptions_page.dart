import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _subCategories = [
  'Entertainment',
  'Productivity',
  'Health',
  'News',
  'Gaming',
  'Cloud Storage',
  'Other'
];
const _subStatuses = ['Active', 'Paused', 'Cancelled'];
const _paymentMethods = [
  'Credit Card',
  'Debit Card',
  'UPI',
  'Net Banking',
  'Wallet',
  'Other'
];
const _frequencies = ['monthly', 'yearly'];

/// Mirrors website Subscriptions.tsx: GET/POST/PUT/DELETE /subscriptions
/// (list supports ?frequency=), GET /:id + GET /:id/transactions for detail,
/// POST /:id/record-payment, and the suggestions flow
/// (GET /suggestions, POST /:id/apply-suggestion, POST /:id/dismiss-suggestion).
class SubscriptionsPage extends StatefulWidget {
  const SubscriptionsPage({super.key});
  @override
  State<SubscriptionsPage> createState() => _SubscriptionsPageState();
}

class _SubscriptionsPageState extends State<SubscriptionsPage> {
  List items = [];
  List suggestions = [];
  bool loading = true;
  bool suggLoading = false;
  String? error;
  String freq = 'monthly';

  @override
  void initState() {
    super.initState();
    load();
    loadSuggestions();
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final res = await ApiClient.dio
          .get('/subscriptions', queryParameters: {'frequency': freq});
      final d = res.data;
      final list = d is List ? d : ((d is Map ? d['items'] : null) as List?) ?? [];
      if (mounted) setState(() => items = list);
    } catch (e) {
      if (mounted) setState(() => error = 'Could not load subscriptions.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> loadSuggestions() async {
    if (mounted) setState(() => suggLoading = true);
    try {
      final res = await ApiClient.dio.get('/subscriptions/suggestions');
      final d = res.data;
      final list = d is Map ? (d['suggestions'] as List?) ?? [] : [];
      if (mounted) setState(() => suggestions = list);
    } catch (_) {
      // Suggestions are best-effort; ignore failures like the web page.
    } finally {
      if (mounted) setState(() => suggLoading = false);
    }
  }

  Future<void> acceptSuggestion(Map s) async {
    final id = s['_id'] ?? s['id'];
    final suggested = s['suggested'] is Map ? s['suggested'] as Map : null;
    final current = s['current'] is Map ? s['current'] as Map : null;
    try {
      await ApiClient.dio.post('/subscriptions/$id/apply-suggestion', data: {
        'acceptAmount': suggested?['amount'] ?? current?['amount'],
        'acceptDate': suggested?['billingDate'] ?? current?['billingDate'],
        'matchedTxIds': s['matchedTxIds'],
      });
      if (mounted) {
        setState(() => suggestions =
            suggestions.where((x) => (x['_id'] ?? x['id']) != id).toList());
      }
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to accept suggestion.')));
      }
    }
  }

  Future<void> dismissSuggestion(Map s) async {
    final id = s['_id'] ?? s['id'];
    if (mounted) {
      setState(() => suggestions =
          suggestions.where((x) => (x['_id'] ?? x['id']) != id).toList());
    }
    try {
      await ApiClient.dio.post('/subscriptions/$id/dismiss-suggestion');
    } catch (_) {
      // Web page also ignores dismiss failures.
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Delete?'),
              content: Text('Delete "${item['name']}"?'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel')),
                TextButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Delete')),
              ],
            ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/subscriptions/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not delete subscription.')));
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (_) => _SubscriptionForm(
              initial: initial,
              onSaved: () {
                Navigator.pop(context);
                load();
              },
            ));
  }

  void openDetail(Map item) {
    Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => _SubscriptionDetailPage(
                id: '${item['_id'] ?? item['id']}',
                initial: Map<String, dynamic>.from(item)))).then((_) => load());
  }

  @override
  Widget build(BuildContext context) {
    double total = 0;
    for (final e in items) {
      if (e is Map) total += ((e['amount'] as num?) ?? 0).toDouble();
    }
    final cadence = freq == 'monthly' ? 'mo' : 'yr';
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Expanded(
                            child: Text(
                                'SUBSCRIPTIONS\nMonthly and yearly services & billing records.',
                                style: TextStyle(fontSize: 12))),
                        BrutalButton(
                            label: '+ Add', onPressed: () => openForm()),
                      ]),
                  const SizedBox(height: 12),
                  Row(children: _frequencies
                      .map((f) => Expanded(
                              child: Padding(
                            padding: EdgeInsets.only(
                                right: f == _frequencies.first ? 8 : 0),
                            child: BrutalButton(
                                label: f == 'monthly' ? 'Monthly' : 'Yearly',
                                onPressed: freq == f
                                    ? null
                                    : () {
                                        setState(() => freq = f);
                                        load();
                                      }),
                          )))
                      .toList()),
                  const SizedBox(height: 12),
                  if (suggLoading)
                    const BrutalCard(
                        child: Text('Checking suggestions…',
                            style: TextStyle(fontSize: 12))),
                  if (suggestions.isNotEmpty)
                    BrutalCard(
                        color: const Color(0xFFFFE500),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('LEDGER LINK — SUGGESTIONS',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13)),
                              const SizedBox(height: 4),
                              const Text(
                                  'Detected payments matching your subscriptions. Accept to update billing and link transactions.',
                                  style: TextStyle(fontSize: 11)),
                              const SizedBox(height: 8),
                              ...suggestions.map((raw) {
                                final s = Map<String, dynamic>.from(raw as Map);
                                final cur = s['current'] is Map
                                    ? s['current'] as Map
                                    : {};
                                final sug = s['suggested'] is Map
                                    ? s['suggested'] as Map
                                    : null;
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                      color: Colors.white,
                                      border: Border.all(width: 2)),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                            mainAxisAlignment:
                                                MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                  child: Text('${s['name'] ?? ''}',
                                                      style: const TextStyle(
                                                          fontWeight:
                                                              FontWeight.w800))),
                                              Text(
                                                  'confidence ${s['confidence'] ?? '—'}%',
                                                  style: const TextStyle(
                                                      fontSize: 10)),
                                            ]),
                                        const SizedBox(height: 4),
                                        Text(
                                            'Current: ₹${(cur['amount'] as num? ?? 0).toStringAsFixed(0)} day ${cur['billingDate'] ?? '—'} → Suggested: ${sug != null ? '₹${(sug['amount'] as num? ?? 0).toStringAsFixed(0)} day ${sug['billingDate'] ?? '—'}' : 'link matching payments'}',
                                            style:
                                                const TextStyle(fontSize: 11)),
                                        Text(
                                            'Matched ${s['matchedCount'] ?? 0} transaction(s)',
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color: Colors.grey)),
                                        const SizedBox(height: 6),
                                        Row(children: [
                                          Expanded(
                                              child: BrutalButton(
                                                  label: 'Accept',
                                                  onPressed: () =>
                                                      acceptSuggestion(s))),
                                          const SizedBox(width: 8),
                                          Expanded(
                                              child: BrutalButton(
                                                  label: 'Dismiss',
                                                  onPressed: () =>
                                                      dismissSuggestion(s))),
                                        ]),
                                      ]),
                                );
                              }),
                            ])),
                  if (suggestions.isNotEmpty) const SizedBox(height: 12),
                  if (items.isEmpty)
                    BrutalCard(
                        child: Text(
                            'No $freq subscriptions yet. Tap + Add to create one.'))
                  else
                    ...items.map((raw) {
                      final sub = Map<String, dynamic>.from(raw as Map);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: GestureDetector(
                          onTap: () => openDetail(sub),
                          child: BrutalCard(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                          child: Text('${sub['name'] ?? ''}',
                                              style: const TextStyle(
                                                  fontSize: 16,
                                                  fontWeight: FontWeight.w800,
                                                  decoration: TextDecoration
                                                      .underline))),
                                      Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                              border:
                                                  Border.all(width: 2)),
                                          child: Text(
                                              '${sub['status'] ?? 'Active'}',
                                              style: const TextStyle(
                                                  fontSize: 10,
                                                  fontWeight:
                                                      FontWeight.w800))),
                                    ]),
                                const SizedBox(height: 4),
                                Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                          '₹${((sub['amount'] as num?) ?? 0).toStringAsFixed(0)}/$cadence',
                                          style: const TextStyle(
                                              fontSize: 24,
                                              fontWeight: FontWeight.w900)),
                                      Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                              border:
                                                  Border.all(width: 2)),
                                          child: Text(
                                              '${sub['category'] ?? 'Other'}',
                                              style: const TextStyle(
                                                  fontSize: 10,
                                                  fontWeight:
                                                      FontWeight.w800))),
                                    ]),
                                const SizedBox(height: 4),
                                Text(
                                    'Billing day ${sub['billingDate'] ?? 1} · ${sub['paymentMethod'] ?? ''}',
                                    style:
                                        const TextStyle(fontSize: 11)),
                                const SizedBox(height: 8),
                                Row(children: [
                                  Expanded(
                                      child: BrutalButton(
                                          label: 'History & Detail',
                                          onPressed: () =>
                                              openDetail(sub))),
                                  const SizedBox(width: 8),
                                  IconButton(
                                      icon: const Icon(Icons.edit, size: 18),
                                      onPressed: () =>
                                          openForm(initial: sub)),
                                  IconButton(
                                      icon: const Icon(Icons.delete, size: 18),
                                      onPressed: () => remove(sub)),
                                ]),
                              ])),
                        ),
                      );
                    }),
                  const SizedBox(height: 8),
                  Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                          color: Colors.black,
                          border: Border.all(width: 3)),
                      child: Row(
                          mainAxisAlignment:
                              MainAxisAlignment.spaceBetween,
                          children: [
                            Text('TOTAL ${freq.toUpperCase()}',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800)),
                            Text('₹${total.toStringAsFixed(0)}/$cadence',
                                style: const TextStyle(
                                    color: Color(0xFFFFE500),
                                    fontSize: 22,
                                    fontWeight: FontWeight.w900)),
                          ])),
                ]),
      floatingActionButton: FloatingActionButton(
          onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
}

/// Detail view for one subscription: doc (GET /:id) plus linked/candidate
/// transactions (GET /:id/transactions), with record-payment action.
class _SubscriptionDetailPage extends StatefulWidget {
  final String id;
  final Map<String, dynamic>? initial;
  const _SubscriptionDetailPage({required this.id, this.initial});
  @override
  State<_SubscriptionDetailPage> createState() =>
      _SubscriptionDetailPageState();
}

class _SubscriptionDetailPageState extends State<_SubscriptionDetailPage> {
  Map<String, dynamic>? detail;
  List linked = [];
  List candidates = [];
  double totalPaid = 0;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    if (widget.initial != null) detail = widget.initial;
    load();
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final doc = await ApiClient.dio.get('/subscriptions/${widget.id}');
      final tx =
          await ApiClient.dio.get('/subscriptions/${widget.id}/transactions');
      final txData = tx.data is Map ? tx.data as Map : {};
      final linkedRaw = (txData['linked'] as List?) ?? [];
      double paid = 0;
      if (txData['totalPaidPaise'] != null) {
        paid = ((txData['totalPaidPaise'] as num?) ?? 0) / 100;
      } else {
        for (final t in linkedRaw) {
          if (t is Map) paid += ((t['amountPaise'] as num?) ?? 0) / 100;
        }
      }
      if (mounted) {
        setState(() {
          detail = doc.data is Map
              ? Map<String, dynamic>.from(doc.data as Map)
              : detail;
          linked = linkedRaw;
          candidates = (txData['suggestions'] as List?) ?? [];
          totalPaid = paid;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = 'Could not load subscription detail.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void openRecordPayment() {
    showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (_) => _RecordPaymentForm(
              id: widget.id,
              defaultAmount: '${detail?['amount'] ?? ''}',
              onSaved: () {
                Navigator.pop(context);
                load();
              },
            ));
  }

  String _txTitle(Map t) {
    final r = t['recipient'];
    if (r is Map && '${r['name'] ?? ''}'.isNotEmpty) return '${r['name']}';
    return '${t['productName'] ?? t['notes'] ?? 'Payment'}';
  }

  double _txRupees(Map t) {
    if (t['amountPaise'] != null) {
      return ((t['amountPaise'] as num?) ?? 0) / 100;
    }
    return ((t['amount'] as num?) ?? 0).toDouble();
  }

  Widget _txTile(Map t) {
    final date = '${t['occurredAt'] ?? t['date'] ?? ''}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration:
          BoxDecoration(color: Colors.white, border: Border.all(width: 2)),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
              Text(_txTitle(t),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(date.length >= 10 ? date.substring(0, 10) : date,
                  style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ])),
        Text('₹${_txRupees(t).toStringAsFixed(0)}',
            style:
                const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = detail ?? {};
    return Scaffold(
      appBar: AppBar(title: Text('${d['name'] ?? 'Subscription'}')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  BrutalCard(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                  child: Text('${d['name'] ?? ''}',
                                      style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.w900))),
                              Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                      border: Border.all(width: 2)),
                                  child: Text('${d['status'] ?? 'Active'}',
                                      style: const TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800))),
                            ]),
                        const SizedBox(height: 6),
                        Text(
                            '₹${((d['amount'] as num?) ?? 0).toStringAsFixed(0)} · ${d['frequency'] ?? 'monthly'} · day ${d['billingDate'] ?? 1}',
                            style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w900)),
                        Text(
                            '${d['category'] ?? 'Other'} · ${d['paymentMethod'] ?? ''}${d['autoRenew'] == true ? ' · Auto-renew' : ''}',
                            style: const TextStyle(fontSize: 12)),
                        if ('${d['notes'] ?? ''}'.isNotEmpty)
                          Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text('${d['notes']}',
                                  style:
                                      const TextStyle(fontSize: 12))),
                        const SizedBox(height: 10),
                        BrutalButton(
                            label: 'Record Payment',
                            onPressed: openRecordPayment),
                      ])),
                  const SizedBox(height: 12),
                  Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                          color: Colors.black,
                          border: Border.all(width: 3)),
                      child: Row(
                          mainAxisAlignment:
                              MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('TOTAL PAID',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800)),
                            Text('₹${totalPaid.toStringAsFixed(0)}',
                                style: const TextStyle(
                                    color: Color(0xFFFFE500),
                                    fontSize: 22,
                                    fontWeight: FontWeight.w900)),
                          ])),
                  const SizedBox(height: 12),
                  const Text('LINKED PAYMENTS',
                      style: TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 13)),
                  const SizedBox(height: 8),
                  if (linked.isEmpty)
                    const BrutalCard(
                        child: Text('No linked payments yet.',
                            style: TextStyle(fontSize: 12)))
                  else
                    ...linked.map((t) =>
                        _txTile(Map<String, dynamic>.from(t as Map))),
                  if (candidates.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Text('MATCHING CANDIDATES',
                        style: TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 13)),
                    const SizedBox(height: 8),
                    ...candidates.map((t) =>
                        _txTile(Map<String, dynamic>.from(t as Map))),
                  ],
                ]),
    );
  }
}

class _RecordPaymentForm extends StatefulWidget {
  final String id;
  final String defaultAmount;
  final VoidCallback onSaved;
  const _RecordPaymentForm(
      {required this.id, required this.defaultAmount, required this.onSaved});
  @override
  State<_RecordPaymentForm> createState() => _RecordPaymentFormState();
}

class _RecordPaymentFormState extends State<_RecordPaymentForm> {
  late final TextEditingController amountCtrl, dateCtrl, notesCtrl;
  String mode = 'UPI';
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    amountCtrl = TextEditingController(text: widget.defaultAmount);
    dateCtrl = TextEditingController(text: '');
    notesCtrl = TextEditingController(text: '');
  }

  Future<void> save() async {
    if ((double.tryParse(amountCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Valid amount is required.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ApiClient.dio.post('/subscriptions/${widget.id}/record-payment',
          data: {
            'amount': double.parse(amountCtrl.text),
            'mode': mode,
            if (dateCtrl.text.trim().isNotEmpty)
              'date': dateCtrl.text.trim(),
            if (notesCtrl.text.trim().isNotEmpty)
              'notes': notesCtrl.text.trim(),
          });
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not record payment.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: 16,
          right: 16,
          top: 16),
      child: SingleChildScrollView(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
            const Text('RECORD PAYMENT',
                style:
                    TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(error!,
                  style: const TextStyle(color: Colors.red, fontSize: 12)),
            ],
            BrutalField(
                label: 'Amount ₹', controller: amountCtrl, hint: '0'),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: BrutalField(
                      label: 'Date (YYYY-MM-DD)',
                      controller: dateCtrl,
                      hint: 'Today if empty')),
              const SizedBox(width: 8),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('MODE',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    DropdownButton<String>(
                        value: mode,
                        isExpanded: true,
                        items: _modesForPayment
                            .map((m) =>
                                DropdownMenuItem(value: m, child: Text(m)))
                            .toList(),
                        onChanged: (v) => setState(() => mode = v!)),
                  ])),
            ]),
            const SizedBox(height: 8),
            BrutalField(
                label: 'Notes', controller: notesCtrl, hint: 'Optional…'),
            const SizedBox(height: 12),
            BrutalButton(
                label: busy ? 'Saving…' : 'Save',
                onPressed: busy ? null : save),
            const SizedBox(height: 20),
          ])),
    );
  }
}

const _modesForPayment = ['UPI', 'CARD', 'CASH', 'BANK', 'OTHER'];

class _SubscriptionForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _SubscriptionForm({this.initial, required this.onSaved});
  @override
  State<_SubscriptionForm> createState() => _SubscriptionFormState();
}

class _SubscriptionFormState extends State<_SubscriptionForm> {
  late final TextEditingController nameCtrl,
      amountCtrl,
      billingCtrl,
      startCtrl,
      reminderCtrl,
      notesCtrl;
  String category = 'Entertainment';
  String status = 'Active';
  String frequency = 'monthly';
  String paymentMethod = 'Credit Card';
  bool autoRenew = true;
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    nameCtrl = TextEditingController(text: '${i?['name'] ?? ''}');
    amountCtrl =
        TextEditingController(text: i != null ? '${i['amount'] ?? ''}' : '');
    billingCtrl = TextEditingController(text: '${i?['billingDate'] ?? 1}');
    startCtrl = TextEditingController(
        text: (('${i?['startDate'] ?? ''}').length >= 10)
            ? ('${i?['startDate']}').substring(0, 10)
            : '');
    reminderCtrl =
        TextEditingController(text: '${i?['renewalReminderDays'] ?? 3}');
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['category'] != null && _subCategories.contains(i!['category'])) {
      category = i['category'];
    }
    if (i?['status'] != null && _subStatuses.contains(i!['status'])) {
      status = i['status'];
    }
    if (i?['frequency'] != null && _frequencies.contains(i!['frequency'])) {
      frequency = i['frequency'];
    }
    if (i?['paymentMethod'] != null &&
        _paymentMethods.contains(i!['paymentMethod'])) {
      paymentMethod = i['paymentMethod'];
    }
    autoRenew = (i?['autoRenew'] ?? true) == true;
  }

  Future<void> save() async {
    if (nameCtrl.text.trim().isEmpty ||
        (double.tryParse(amountCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Name and amount are required.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final payload = {
      'name': nameCtrl.text.trim(),
      'category': category,
      'amount': double.parse(amountCtrl.text),
      'billingDate': int.tryParse(billingCtrl.text) ?? 1,
      'frequency': frequency,
      if (startCtrl.text.trim().isNotEmpty)
        'startDate': startCtrl.text.trim(),
      'renewalReminderDays': int.tryParse(reminderCtrl.text) ?? 3,
      'paymentMethod': paymentMethod,
      'autoRenew': autoRenew,
      'status': status,
      if (notesCtrl.text.trim().isNotEmpty)
        'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put(
            "/subscriptions/${widget.initial!['_id'] ?? widget.initial!['id']}",
            data: payload);
      } else {
        await ApiClient.dio.post('/subscriptions', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save subscription.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: 16,
          right: 16,
          top: 16),
      child: SingleChildScrollView(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
            Text(
                widget.initial != null
                    ? 'EDIT SUBSCRIPTION'
                    : 'ADD SUBSCRIPTION',
                style:
                    const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(error!,
                  style: const TextStyle(color: Colors.red, fontSize: 12)),
            ],
            BrutalField(
                label: 'Name', controller: nameCtrl, hint: 'e.g. Netflix'),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('CATEGORY',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    DropdownButton<String>(
                        value: category,
                        isExpanded: true,
                        items: _subCategories
                            .map((c) =>
                                DropdownMenuItem(value: c, child: Text(c)))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => category = v!)),
                  ])),
              const SizedBox(width: 8),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('STATUS',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    DropdownButton<String>(
                        value: status,
                        isExpanded: true,
                        items: _subStatuses
                            .map((s) =>
                                DropdownMenuItem(value: s, child: Text(s)))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => status = v!)),
                  ])),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: BrutalField(
                      label: 'Amount ₹',
                      controller: amountCtrl,
                      hint: '0')),
              const SizedBox(width: 8),
              Expanded(
                  child: BrutalField(
                      label: 'Billing day (1-31)',
                      controller: billingCtrl,
                      hint: '1')),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('FREQUENCY',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    DropdownButton<String>(
                        value: frequency,
                        isExpanded: true,
                        items: _frequencies
                            .map((f) =>
                                DropdownMenuItem(value: f, child: Text(f)))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => frequency = v!)),
                  ])),
              const SizedBox(width: 8),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('PAYMENT METHOD',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    DropdownButton<String>(
                        value: paymentMethod,
                        isExpanded: true,
                        items: _paymentMethods
                            .map((p) =>
                                DropdownMenuItem(value: p, child: Text(p)))
                            .toList(),
                        onChanged: (v) =>
                            setState(() => paymentMethod = v!)),
                  ])),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: BrutalField(
                      label: 'Start date (YYYY-MM-DD)',
                      controller: startCtrl,
                      hint: '2026-01-01')),
              const SizedBox(width: 8),
              Expanded(
                  child: BrutalField(
                      label: 'Reminder days',
                      controller: reminderCtrl,
                      hint: '3')),
            ]),
            Row(children: [
              Checkbox(
                  value: autoRenew,
                  onChanged: (v) =>
                      setState(() => autoRenew = v ?? true)),
              Text(autoRenew ? 'Auto-renew' : 'No auto-renew',
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700)),
            ]),
            BrutalField(
                label: 'Notes',
                controller: notesCtrl,
                hint: 'Additional details…'),
            const SizedBox(height: 12),
            BrutalButton(
                label: busy ? 'Saving…' : 'Save',
                onPressed: busy ? null : save),
            const SizedBox(height: 20),
          ])),
    );
  }
}
