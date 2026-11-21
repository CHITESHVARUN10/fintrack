import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

const _subCategories = [
  'Entertainment',
  'Productivity',
  'Health',
  'News',
  'Gaming',
  'Cloud Storage',
  'Other',
];
const _subStatuses = ['Active', 'Paused', 'Cancelled'];
const _paymentMethods = [
  'Credit Card',
  'Debit Card',
  'UPI',
  'Net Banking',
  'Wallet',
  'Other',
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
      final res = await ApiClient.dio.get(
        '/subscriptions',
        queryParameters: {'frequency': freq},
      );
      final d = res.data;
      final list = d is List
          ? d
          : ((d is Map ? d['items'] : null) as List?) ?? [];
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
      await ApiClient.dio.post(
        '/subscriptions/$id/apply-suggestion',
        data: {
          'acceptAmount': suggested?['amount'] ?? current?['amount'],
          'acceptDate': suggested?['billingDate'] ?? current?['billingDate'],
          'matchedTxIds': s['matchedTxIds'],
        },
      );
      if (mounted) {
        setState(
          () => suggestions = suggestions
              .where((x) => (x['_id'] ?? x['id']) != id)
              .toList(),
        );
      }
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to accept suggestion.')),
        );
      }
    }
  }

  Future<void> dismissSuggestion(Map s) async {
    final id = s['_id'] ?? s['id'];
    if (mounted) {
      setState(
        () => suggestions = suggestions
            .where((x) => (x['_id'] ?? x['id']) != id)
            .toList(),
      );
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
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/subscriptions/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete subscription.')),
        );
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _SubscriptionForm(
        initial: initial,
        onSaved: () {
          Navigator.pop(context);
          load();
        },
      ),
    );
  }

  void openDetail(Map item) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _SubscriptionDetailPage(
          id: '${item['_id'] ?? item['id']}',
          initial: Map<String, dynamic>.from(item),
        ),
      ),
    ).then((_) => load());
  }

  @override
  Widget build(BuildContext context) {
    final total = items.whereType<Map>().fold<num>(
      0,
      (sum, item) => sum + ((item['amount'] as num?) ?? 0),
    );
    final cadence = freq == 'monthly' ? 'mo' : 'yr';
    return WorkspaceScaffold(
      title: 'Subscriptions',
      action: BrutalButton(label: '+ Add', onPressed: openForm),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
        children: [
          const WorkspaceIntro(
            'Billing records',
            'Monthly and yearly subscriptions and their linked payments.',
          ),
          const SizedBox(height: 12),
          Row(
            spacing: 10,
            children: [
              for (final value in _frequencies)
                Expanded(
                  child: Semantics(
                    selected: freq == value,
                    child: BrutalButton(
                      label: value,
                      color: freq == value
                          ? FinStackColors.brandYellow
                          : Colors.white,
                      block: true,
                      onPressed: () {
                        if (freq == value || loading) return;
                        setState(() => freq = value);
                        load();
                      },
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (loading)
            const LinearProgressIndicator(
              semanticsLabel: 'Loading subscriptions',
            )
          else if (error != null) ...[
            BrutalCard(
              color: FinStackColors.errorContainer,
              child: Text(error!),
            ),
            const SizedBox(height: 10),
            BrutalButton(label: 'Retry', onPressed: load),
          ] else ...[
            if (suggLoading)
              const LinearProgressIndicator(
                semanticsLabel: 'Checking suggestions',
              ),
            if (suggestions.isNotEmpty) ...[
              BrutalCard(
                color: FinStackColors.brandYellow,
                child: Column(
                  spacing: 10,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const BrutalSectionTitle(
                      title: 'Ledger suggestions',
                      accent: Colors.white,
                    ),
                    const Text(
                      'Link matching payments and update the billing details.',
                    ),
                    for (final suggestion in suggestions.whereType<Map>())
                      _suggestionCard(suggestion),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (items.isEmpty) ...[
              BrutalEmpty(
                icon: Icons.event_repeat,
                message: 'No $freq subscriptions. Tap Add to create one.',
              ),
              const SizedBox(height: 12),
            ] else
              for (final item in items.whereType<Map>())
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _subscriptionCard(item, cadence),
                ),
            WorkspaceTotal(
              label: 'Total $freq',
              value: '${inr(total)}/$cadence',
            ),
          ],
        ],
      ),
    );
  }

  Widget _suggestionCard(Map suggestion) {
    final current = suggestion['current'] is Map
        ? suggestion['current'] as Map
        : const {};
    final proposed = suggestion['suggested'] is Map
        ? suggestion['suggested'] as Map
        : null;
    return BrutalCard(
      border: 2,
      shadow: 0,
      padding: const EdgeInsets.all(10),
      child: Column(
        spacing: 7,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${suggestion['name'] ?? ''}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (suggestion['confidence'] != null)
                Text(
                  '${suggestion['confidence']}% confidence',
                  style: FinStackType.caption,
                ),
            ],
          ),
          Text(
            'Current: ${inr((current['amount'] as num?) ?? 0)}, day ${current['billingDate'] ?? '—'}'
            '${proposed == null ? '' : ' → ${inr((proposed['amount'] as num?) ?? 0)}, day ${proposed['billingDate'] ?? '—'}'}',
          ),
          Text(
            '${suggestion['matchedCount'] ?? 0} matching payments',
            style: FinStackType.caption,
          ),
          Row(
            spacing: 8,
            children: [
              Expanded(
                child: BrutalButton(
                  label: 'Accept',
                  onPressed: () => acceptSuggestion(suggestion),
                ),
              ),
              Expanded(
                child: BrutalButton(
                  label: 'Dismiss',
                  color: Colors.white,
                  onPressed: () => dismissSuggestion(suggestion),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _subscriptionCard(Map item, String cadence) {
    final status = '${item['status'] ?? 'Active'}';
    final active = status.toLowerCase() == 'active';
    return BrutalCard(
      child: Column(
        spacing: 9,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            spacing: 8,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  spacing: 4,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item['name'] ?? ''}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      '${inr((item['amount'] as num?) ?? 0)}/$cadence',
                      style: FinStackType.amount,
                    ),
                    Text(
                      'Billing day ${item['billingDate'] ?? 1} · ${item['paymentMethod'] ?? ''}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Column(
                spacing: 5,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  BrutalTag(
                    label: status,
                    color: active
                        ? FinStackColors.successContainer
                        : FinStackColors.surfaceContainer,
                    textColor: active
                        ? FinStackColors.successInk
                        : FinStackColors.onSurface,
                  ),
                  BrutalTag(
                    label: '${item['category'] ?? 'Other'}',
                    color: Colors.white,
                  ),
                ],
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: BrutalButton(
                  label: 'History & detail',
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 12,
                  ),
                  onPressed: () => openDetail(item),
                ),
              ),
              const SizedBox(width: 8),
              WorkspaceItemActions(
                onEdit: () => openForm(initial: item),
                onRemove: () => remove(item),
              ),
            ],
          ),
        ],
      ),
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
      final tx = await ApiClient.dio.get(
        '/subscriptions/${widget.id}/transactions',
      );
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
      if (mounted) {
        setState(() => error = 'Could not load subscription detail.');
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void openRecordPayment() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _RecordPaymentForm(
        id: widget.id,
        defaultAmount: '${detail?['amount'] ?? ''}',
        onSaved: () {
          Navigator.pop(context);
          load();
        },
      ),
    );
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

  String? _linkingId;

  Future<void> _linkPayment(String transactionId) async {
    if (_linkingId != null) return;
    setState(() => _linkingId = transactionId);
    try {
      await ApiClient.dio.post(
        '/subscriptions/${widget.id}/link-transaction',
        data: {'transactionId': transactionId},
      );
      if (mounted) await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not link this payment. Try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _linkingId = null);
    }
  }

  Widget _txTile(Map item, {bool canLink = false}) {
    final rawDate = '${item['occurredAt'] ?? item['date'] ?? ''}';
    final date = DateTime.tryParse(rawDate)?.toLocal();
    final id = item['_id'] ?? item['id'];
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: BrutalCard(
        border: 2,
        shadow: 2,
        padding: const EdgeInsets.all(9),
        child: Row(
          spacing: 8,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _txTitle(item),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  if (date != null)
                    Text(dateLabel(date), style: FinStackType.caption),
                ],
              ),
            ),
            Text(
              inr(_txRupees(item)),
              style: FinStackType.amount.copyWith(fontSize: 14),
            ),
            if (canLink && id != null)
              BrutalButton(
                label: _linkingId == '$id' ? 'Linking…' : 'Link',
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 10,
                ),
                onPressed: _linkingId == null
                    ? () => _linkPayment('$id')
                    : null,
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = detail ?? {};
    final status = '${data['status'] ?? 'Active'}';
    final active = status.toLowerCase() == 'active';
    return WorkspaceScaffold(
      title: '${data['name'] ?? 'Subscription'}',
      action: data.isEmpty
          ? null
          : BrutalTag(
              label: status,
              color: active
                  ? FinStackColors.successContainer
                  : FinStackColors.surfaceContainer,
              textColor: active
                  ? FinStackColors.successInk
                  : FinStackColors.onSurface,
            ),
      body: loading
          ? const BrutalLoading(label: 'Loading payment history…')
          : error != null
          ? BrutalError(message: error!, onRetry: load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
              children: [
                BrutalCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 8,
                    children: [
                      Text(
                        '${data['name'] ?? ''}',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text(
                        '${inr((data['amount'] as num?) ?? 0)} · ${data['frequency'] ?? 'monthly'} · day ${data['billingDate'] ?? 1}',
                        style: FinStackType.amount.copyWith(fontSize: 16),
                      ),
                      Text(
                        '${data['category'] ?? 'Other'} · ${data['paymentMethod'] ?? ''}'
                        '\n${data['autoRenew'] == true ? 'Renews automatically.' : 'Manual renewal.'}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      if ('${data['notes'] ?? ''}'.isNotEmpty)
                        Text('${data['notes']}'),
                      BrutalButton(
                        label: 'Record payment',
                        onPressed: openRecordPayment,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                WorkspaceTotal(label: 'Total paid', value: inr(totalPaid)),
                const SizedBox(height: 15),
                const BrutalSectionTitle(title: 'Linked payments'),
                const SizedBox(height: 8),
                if (linked.isEmpty)
                  const BrutalCard(child: Text('No linked payments yet.'))
                else
                  for (final item in linked.whereType<Map>()) _txTile(item),
                const SizedBox(height: 12),
                const BrutalSectionTitle(
                  title: 'Matching candidates',
                  accent: FinStackColors.accentCyan,
                ),
                const SizedBox(height: 8),
                if (candidates.isEmpty)
                  const BrutalCard(
                    color: FinStackColors.surfaceContainer,
                    child: Text('No unlinked matching payments.'),
                  )
                else
                  for (final item in candidates.whereType<Map>())
                    _txTile(item, canLink: true),
              ],
            ),
    );
  }
}

class _RecordPaymentForm extends StatefulWidget {
  final String id;
  final String defaultAmount;
  final VoidCallback onSaved;
  const _RecordPaymentForm({
    required this.id,
    required this.defaultAmount,
    required this.onSaved,
  });
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
      await ApiClient.dio.post(
        '/subscriptions/${widget.id}/record-payment',
        data: {
          'amount': double.parse(amountCtrl.text),
          'mode': mode,
          if (dateCtrl.text.trim().isNotEmpty) 'date': dateCtrl.text.trim(),
          if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
        },
      );
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
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'RECORD PAYMENT',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
            BrutalField(label: 'Amount ₹', controller: amountCtrl, hint: '0'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: BrutalField(
                    label: 'Date (YYYY-MM-DD)',
                    controller: dateCtrl,
                    hint: 'Today if empty',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'MODE',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: mode,
                        isExpanded: true,
                        items: _modesForPayment
                            .map(
                              (m) => DropdownMenuItem(value: m, child: Text(m)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => mode = v!),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Notes',
              controller: notesCtrl,
              hint: 'Optional…',
            ),
            const SizedBox(height: 12),
            BrutalButton(
              label: busy ? 'Saving…' : 'Save',
              onPressed: busy ? null : save,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
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
    amountCtrl = TextEditingController(
      text: i != null ? '${i['amount'] ?? ''}' : '',
    );
    billingCtrl = TextEditingController(text: '${i?['billingDate'] ?? 1}');
    startCtrl = TextEditingController(
      text: (('${i?['startDate'] ?? ''}').length >= 10)
          ? ('${i?['startDate']}').substring(0, 10)
          : '',
    );
    reminderCtrl = TextEditingController(
      text: '${i?['renewalReminderDays'] ?? 3}',
    );
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
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      'renewalReminderDays': int.tryParse(reminderCtrl.text) ?? 3,
      'paymentMethod': paymentMethod,
      'autoRenew': autoRenew,
      'status': status,
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put(
          "/subscriptions/${widget.initial!['_id'] ?? widget.initial!['id']}",
          data: payload,
        );
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
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.initial != null ? 'EDIT SUBSCRIPTION' : 'ADD SUBSCRIPTION',
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
            BrutalField(
              label: 'Name',
              controller: nameCtrl,
              hint: 'e.g. Netflix',
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'CATEGORY',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: category,
                        isExpanded: true,
                        items: _subCategories
                            .map(
                              (c) => DropdownMenuItem(value: c, child: Text(c)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => category = v!),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'STATUS',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: status,
                        isExpanded: true,
                        items: _subStatuses
                            .map(
                              (s) => DropdownMenuItem(value: s, child: Text(s)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => status = v!),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: BrutalField(
                    label: 'Amount ₹',
                    controller: amountCtrl,
                    hint: '0',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BrutalField(
                    label: 'Billing day (1-31)',
                    controller: billingCtrl,
                    hint: '1',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'FREQUENCY',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: frequency,
                        isExpanded: true,
                        items: _frequencies
                            .map(
                              (f) => DropdownMenuItem(value: f, child: Text(f)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => frequency = v!),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'PAYMENT METHOD',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: paymentMethod,
                        isExpanded: true,
                        items: _paymentMethods
                            .map(
                              (p) => DropdownMenuItem(value: p, child: Text(p)),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => paymentMethod = v!),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: BrutalField(
                    label: 'Start date (YYYY-MM-DD)',
                    controller: startCtrl,
                    hint: '2026-01-01',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BrutalField(
                    label: 'Reminder days',
                    controller: reminderCtrl,
                    hint: '3',
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Checkbox(
                  value: autoRenew,
                  onChanged: (v) => setState(() => autoRenew = v ?? true),
                ),
                Text(
                  autoRenew ? 'Auto-renew' : 'No auto-renew',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            BrutalField(
              label: 'Notes',
              controller: notesCtrl,
              hint: 'Additional details…',
            ),
            const SizedBox(height: 12),
            BrutalButton(
              label: busy ? 'Saving…' : 'Save',
              onPressed: busy ? null : save,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
