import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';
import '../core/format.dart';
import '../widgets/finance_transactions.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

const _categories = [
  'Salary',
  'Freelance',
  'Pocket Money',
  'Rental',
  'Business',
  'Other',
];

/// Mirrors website Income.tsx: GET/POST/PUT/DELETE /income with the same fields.
class IncomePage extends StatefulWidget {
  const IncomePage({super.key});
  @override
  State<IncomePage> createState() => _IncomePageState();
}

class _IncomePageState extends State<IncomePage> {
  List items = [];
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
      final res = await ApiClient.dio.get('/income');
      if (!mounted) return;
      setState(() => items = (res.data as List?) ?? []);
    } catch (e) {
      if (mounted) setState(() => error = 'Could not load income.');
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
    if (ok != true || !mounted) return;
    try {
      await ApiClient.dio.delete("/income/${item['_id'] ?? item['id']}");
      if (mounted) await load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ApiClient.errorMessage(e, 'Could not delete income.'),
            ),
          ),
        );
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _IncomeForm(
        initial: initial,
        onSaved: () {
          Navigator.pop(sheetContext);
          if (mounted) load();
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
      title: 'Income',
      action: BrutalButton(label: '+ Add', onPressed: openForm),
      body: loading
          ? const BrutalLoading(label: 'Loading income sources…')
          : error != null
          ? BrutalError(message: error!, onRetry: load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
              children: [
                const WorkspaceIntro(
                  'Income sources',
                  'Regular and variable sources with linked ledger payments.',
                ),
                const SizedBox(height: 12),

                if (items.isEmpty)
                  const BrutalEmpty(
                    icon: Icons.account_balance_wallet_outlined,
                    message: 'No income sources yet. Tap Add to create one.',
                  )
                else
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: WorkspaceScheduledCard(
                        title: '${item['title'] ?? ''}',
                        category: '${item['category'] ?? 'Other'}',
                        amount:
                            item['payPattern'] == 'variable' &&
                                (item['amount'] ?? 0) == 0
                            ? 'Varies'
                            : inr((item['amount'] as num?) ?? 0),
                        detail: item['payPattern'] == 'variable'
                            ? "${(item['amount'] ?? 0) == 0 ? 'Variable · as received' : 'Variable · monthly estimate'} · ${item['taxable'] == true ? 'Taxable' : 'Non-taxable'}"
                            : "Credits on day ${item['creditDate'] ?? 1} · ${item['taxable'] == true ? 'Taxable' : 'Non-taxable'}",
                        onEdit: () =>
                            openForm(initial: Map<String, dynamic>.from(item)),
                        onDelete: () => remove(item),
                        footer: BrutalButton(
                          label: 'Transactions',
                          color: Colors.white,
                          onPressed: () => showFinanceTransactions(
                            context,
                            kind: 'income',
                            id: "${item['_id'] ?? item['id']}",
                            name: "${item['title'] ?? 'Income'}",
                          ),
                        ),
                      ),
                    ),
                const SizedBox(height: 4),
                WorkspaceTotal(label: 'Planned monthly', value: inr(total)),
              ],
            ),
    );
  }
}

class _IncomeForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _IncomeForm({this.initial, required this.onSaved});
  @override
  State<_IncomeForm> createState() => _IncomeFormState();
}

class _IncomeFormState extends State<_IncomeForm> {
  late final TextEditingController titleCtrl,
      amountCtrl,
      creditCtrl,
      startCtrl,
      notesCtrl;
  String category = 'Salary';
  String pattern = 'regular';
  bool get regular => pattern == 'regular';
  bool taxable = true;
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
    creditCtrl = TextEditingController(text: '${i?['creditDate'] ?? 1}');
    startCtrl = TextEditingController(
      text: (('${i?['startDate'] ?? ''}').length >= 10)
          ? ('${i?['startDate']}').substring(0, 10)
          : '',
    );
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['category'] != null && _categories.contains(i!['category'])) {
      category = i['category'];
    }
    taxable = (i?['taxable'] ?? true) == true;
    if (i?['payPattern'] == 'variable') pattern = 'variable';
  }

  @override
  void dispose() {
    for (final controller in [
      titleCtrl,
      amountCtrl,
      creditCtrl,
      startCtrl,
      notesCtrl,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    final amount = amountCtrl.text.trim().isEmpty
        ? 0.0
        : double.tryParse(amountCtrl.text.trim());
    final credit = int.tryParse(creditCtrl.text.trim());
    if (titleCtrl.text.trim().isEmpty ||
        amount == null ||
        !amount.isFinite ||
        amount < 0 ||
        (regular && amount == 0)) {
      setState(
        () => error =
            'Enter a title and a valid ${regular ? 'monthly amount' : 'estimate, or leave the estimate blank'}.',
      );
      return;
    }
    if (regular && (credit == null || credit < 1 || credit > 31)) {
      setState(() => error = 'Enter a credit day from 1 to 31.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final payload = {
      'title': titleCtrl.text.trim(),
      'amount': amount,
      'payPattern': pattern,
      'category': category,
      'creditDate': regular ? credit : null,
      'taxable': taxable,
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put(
          "/income/${widget.initial!['_id'] ?? widget.initial!['id']}",
          data: payload,
        );
      } else {
        await ApiClient.dio.post('/income', data: payload);
      }
      if (mounted) widget.onSaved();
    } catch (e) {
      if (mounted) {
        setState(
          () => error = ApiClient.errorMessage(e, 'Could not save income.'),
        );
      }
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
              widget.initial != null ? 'EDIT INCOME' : 'ADD INCOME',
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
              hint: 'e.g. Main Salary',
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: pattern,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Payment pattern'),
              items: const [
                DropdownMenuItem(
                  value: 'regular',
                  child: Text('Regular monthly'),
                ),
                DropdownMenuItem(
                  value: 'variable',
                  child: Text('Variable or occasional'),
                ),
              ],
              onChanged: (value) => setState(() => pattern = value!),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: BrutalField(
                    label: regular
                        ? 'Monthly amount ₹'
                        : 'Monthly estimate ₹ (optional)',
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    controller: amountCtrl,
                    hint: '0',
                  ),
                ),
                const SizedBox(width: 8),
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
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (regular) ...[
                  Expanded(
                    child: BrutalField(
                      label: 'Credit day (1-31)',
                      controller: creditCtrl,
                      keyboardType: TextInputType.number,
                      hint: '1',
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Row(
                    children: [
                      Checkbox(
                        value: taxable,
                        onChanged: (v) => setState(() => taxable = v ?? true),
                      ),
                      Text(
                        taxable ? 'Taxable' : 'Non-taxable',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
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
