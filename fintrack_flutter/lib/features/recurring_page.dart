import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

const _categories = [
  'Household',
  'Utility',
  'Staff',
  'Society',
  'Vehicle',
  'Other',
];
const _methods = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Cash',
  'Net Banking',
  'Other',
];

/// Mirrors website Recurring.tsx: GET/POST/PUT/DELETE /recurring with the same
/// fields, plus the backend-only suggestion endpoints
/// (GET /recurring/suggestions, POST /:id/apply-suggestion,
/// POST /:id/dismiss-suggestion) which the web page does not render.
class RecurringPage extends StatefulWidget {
  const RecurringPage({super.key});
  @override
  State<RecurringPage> createState() => _RecurringPageState();
}

class _RecurringPageState extends State<RecurringPage> {
  List items = [];
  List suggestions = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final res = await ApiClient.dio.get('/recurring');
      List fetched = (res.data as List?) ?? [];
      List fetchedSuggestions = [];
      try {
        final sres = await ApiClient.dio.get('/recurring/suggestions');
        final data = sres.data;
        if (data is Map && data['suggestions'] is List) {
          fetchedSuggestions = data['suggestions'] as List;
        } else if (data is List) {
          fetchedSuggestions = data;
        }
      } catch (_) {
        // Suggestions are optional (require a joined family); ignore failures.
      }
      if (!mounted) return;
      setState(() {
        items = fetched;
        suggestions = fetchedSuggestions;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load payments.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete?'),
        content: Text('Delete "${item['title']}"?'),
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
      await ApiClient.dio.delete("/recurring/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete payment.')),
        );
      }
    }
  }

  Future<void> applySuggestion(Map s) async {
    try {
      await ApiClient.dio.post(
        "/recurring/${s['_id'] ?? s['id'] ?? s['recurringId'] ?? ''}/apply-suggestion",
        data: {},
      );
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not apply suggestion.')),
        );
      }
    }
  }

  Future<void> dismissSuggestion(Map s) async {
    try {
      await ApiClient.dio.post(
        "/recurring/${s['_id'] ?? s['id'] ?? s['recurringId'] ?? ''}/dismiss-suggestion",
        data: {},
      );
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not dismiss suggestion.')),
        );
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _RecurringForm(
        initial: initial,
        onSaved: () {
          Navigator.pop(context);
          load();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = items.fold<double>(
      0,
      (sum, item) => sum + ((item['amount'] as num?) ?? 0),
    );
    return WorkspaceScaffold(
      title: 'Recurring',
      action: BrutalButton(label: '+ Add', onPressed: openForm),
      body: loading
          ? const BrutalLoading(label: 'Loading recurring payments…')
          : error != null
          ? BrutalError(message: error!, onRetry: load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
              children: [
                const WorkspaceIntro(
                  'Recurring payments',
                  'Fixed household and utility obligations.',
                ),
                const SizedBox(height: 12),

                for (final suggestion in suggestions.whereType<Map>()) ...[
                  BrutalCard(
                    color: FinStackColors.brandYellow,
                    child: Column(
                      spacing: 8,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('SUGGESTIONS', style: FinStackType.caption),
                        Text(
                          '${suggestion['title'] ?? suggestion['suggestedTitle'] ?? 'Suggested payment'}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        if (suggestion['reason'] != null)
                          Text('${suggestion['reason']}'),
                        Row(
                          children: [
                            Expanded(
                              child: BrutalButton(
                                label: 'Apply',
                                color: Colors.white,
                                onPressed: () => applySuggestion(suggestion),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: BrutalButton(
                                label: 'Dismiss',
                                color: FinStackColors.surfaceContainer,
                                onPressed: () => dismissSuggestion(suggestion),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                if (items.isEmpty)
                  const BrutalEmpty(
                    icon: Icons.event_repeat,
                    message:
                        'No recurring payments yet. Tap Add to create one.',
                  )
                else
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: WorkspaceScheduledCard(
                        title: '${item['title'] ?? ''}',
                        category: '${item['category'] ?? 'Other'}',
                        amount: inr((item['amount'] as num?) ?? 0),
                        detail:
                            "Due on day ${item['dueDate'] ?? 1} · ${item['paymentMethod'] ?? ''}",
                        onEdit: () =>
                            openForm(initial: Map<String, dynamic>.from(item)),
                        onDelete: () => remove(item),
                      ),
                    ),
                const SizedBox(height: 4),
                WorkspaceTotal(
                  label: 'Total monthly outflow',
                  value: inr(total),
                ),
              ],
            ),
    );
  }
}

class _RecurringForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _RecurringForm({this.initial, required this.onSaved});
  @override
  State<_RecurringForm> createState() => _RecurringFormState();
}

class _RecurringFormState extends State<_RecurringForm> {
  late final TextEditingController titleCtrl,
      amountCtrl,
      dueCtrl,
      startCtrl,
      notesCtrl;
  String category = 'Household';
  String paymentMethod = 'Bank Transfer';
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    titleCtrl = TextEditingController(text: '${i?['title'] ?? ''}');
    amountCtrl = TextEditingController(
      text: i != null ? '${i['amount'] ?? ''}' : '',
    );
    dueCtrl = TextEditingController(text: '${i?['dueDate'] ?? 1}');
    startCtrl = TextEditingController(
      text: (('${i?['startDate'] ?? ''}').length >= 10)
          ? ('${i?['startDate']}').substring(0, 10)
          : '',
    );
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['category'] != null && _categories.contains(i!['category'])) {
      category = i['category'];
    }
    if (i?['paymentMethod'] != null && _methods.contains(i!['paymentMethod'])) {
      paymentMethod = i['paymentMethod'];
    }
  }

  Future<void> save() async {
    if (titleCtrl.text.trim().isEmpty ||
        (double.tryParse(amountCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Title and amount are required.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final payload = {
      'title': titleCtrl.text.trim(),
      'category': category,
      'amount': double.parse(amountCtrl.text),
      'dueDate': int.tryParse(dueCtrl.text) ?? 1,
      'paymentMethod': paymentMethod,
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put(
          "/recurring/${widget.initial!['_id'] ?? widget.initial!['id']}",
          data: payload,
        );
      } else {
        await ApiClient.dio.post('/recurring', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save payment.');
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
            WorkspaceSheetTitle(
              widget.initial != null ? 'EDIT PAYMENT' : 'ADD PAYMENT',
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
            BrutalField(
              label: 'Title',
              controller: titleCtrl,
              hint: 'e.g. City Rentals',
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
                        items: _categories
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
                        'PAYMENT METHOD',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: paymentMethod,
                        isExpanded: true,
                        items: _methods
                            .map(
                              (c) => DropdownMenuItem(
                                value: c,
                                child: Text(c, overflow: TextOverflow.ellipsis),
                              ),
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
                    label: 'Amount ₹',
                    controller: amountCtrl,
                    hint: '0',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BrutalField(
                    label: 'Due day (1-31)',
                    controller: dueCtrl,
                    hint: '1',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Start date (YYYY-MM-DD)',
              controller: startCtrl,
              hint: '2026-01-01',
            ),
            const SizedBox(height: 8),
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
