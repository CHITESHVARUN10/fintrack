import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/workspace.dart';
import '../core/format.dart';
import '../widgets/states.dart';

class BudgetsPage extends StatefulWidget {
  const BudgetsPage({super.key});
  @override
  State<BudgetsPage> createState() => _BudgetsPageState();
}

class _BudgetsPageState extends State<BudgetsPage> {
  List items = [];
  bool loading = true;
  bool saving = false;
  String? error;
  final amountCtrl = TextEditingController();
  String scope = 'FAMILY';
  String period = 'MONTHLY';
  final categoryCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    amountCtrl.dispose();
    categoryCtrl.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final r = await ApiClient.dio.get('/budgets');
      if (!mounted) return;
      setState(() => items = r.data['items'] ?? r.data ?? []);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Could not load budgets. Check your connection and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    final paise = (double.tryParse(amountCtrl.text) ?? 0) * 100;
    if (paise <= 0) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Enter a budget amount')));
      return;
    }
    setState(() => saving = true);
    try {
      await ApiClient.dio.post(
        '/budgets',
        data: {
          'scope': scope,
          'category': scope == 'CATEGORY' && categoryCtrl.text.trim().isNotEmpty
              ? categoryCtrl.text.trim()
              : null,
          'period': period,
          'amountPaise': paise.round(),
        },
      );
      amountCtrl.clear();
      categoryCtrl.clear();
      await load();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Budget saved')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not save budget. Check your connection.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final monthLabel = monthYearLabel(DateTime.now());
    return WorkspaceScaffold(
      title: 'Budgets',
      action: BrutalTag(
        label: monthLabel,
        color: FinStackColors.surfaceContainer,
      ),
      body: loading
          ? const BrutalLoading(label: 'Loading budgets…', cards: 2)
          : error != null
          ? BrutalError(message: error!, onRetry: load)
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
                children: [
                  BrutalCard(
                    child: Column(
                      spacing: 10,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const BrutalSectionTitle(title: 'New budget'),
                        DropdownButtonFormField<String>(
                          initialValue: scope,
                          decoration: const InputDecoration(labelText: 'Scope'),
                          items: const ['FAMILY', 'CATEGORY', 'MEMBER']
                              .map(
                                (value) => DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            if (value != null) setState(() => scope = value);
                          },
                        ),
                        if (scope == 'CATEGORY')
                          BrutalField(
                            label: 'Category',
                            controller: categoryCtrl,
                            hint: 'e.g. Dining, Travel',
                          ),
                        BrutalField(
                          label: 'Amount ₹',
                          controller: amountCtrl,
                          hint: 'e.g. 5000',
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                        ),
                        BrutalButton(
                          label: saving ? 'Saving…' : 'Save budget',
                          block: true,
                          onPressed: saving ? null : save,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 13),
                  if (items.isEmpty)
                    const BrutalEmpty(
                      icon: Icons.savings_outlined,
                      message:
                          'No budgets yet. Create one above to start tracking a spending limit.',
                    )
                  else
                    for (final item in items.whereType<Map>())
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _budgetCard(item),
                      ),
                ],
              ),
            ),
    );
  }

  Widget _budgetCard(Map item) {
    final limit = num.tryParse('${item['amountPaise']}') ?? 0;
    final spent = num.tryParse('${item['spentPaise']}') ?? 0;
    final ratio = limit <= 0 ? 0.0 : (spent / limit).clamp(0.0, 1.0);
    final over = spent > limit;
    final category = '${item['category'] ?? ''}';
    final scope = '${item['scope'] ?? ''}';
    return BrutalCard(
      child: Column(
        spacing: 9,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  category.isEmpty ? scope : '$scope · $category',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                inr(limit / 100),
                style: FinStackType.amount.copyWith(fontSize: 14),
              ),
            ],
          ),
          Semantics(
            label: 'Budget used',
            value: '${(ratio * 100).round()} percent',
            child: Container(
              height: 12,
              decoration: brutal(
                color: FinStackColors.surfaceContainer,
                border: 2,
                shadow: 0,
              ),
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: ratio,
                child: ColoredBox(
                  color: over
                      ? FinStackColors.accentPink
                      : FinStackColors.onSurface,
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Spent ${inr(spent / 100)}${over ? '' : ' (${(ratio * 100).round()}%)'}',
                  style: FinStackType.caption,
                ),
              ),
              if (over)
                const BrutalTag(
                  label: 'Over budget',
                  color: FinStackColors.errorContainer,
                  textColor: FinStackColors.onErrorContainer,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
