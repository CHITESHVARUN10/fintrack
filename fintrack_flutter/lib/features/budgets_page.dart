import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
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
        setState(() => error = 'Could not load budgets. Check your connection and retry.');
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> save() async {
    final paise = (double.tryParse(amountCtrl.text) ?? 0) * 100;
    if (paise <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Enter a budget amount')));
      return;
    }
    setState(() => saving = true);
    try {
      await ApiClient.dio.post('/budgets', data: {
        'scope': scope,
        'category': categoryCtrl.text.isEmpty ? null : categoryCtrl.text,
        'period': period,
        'amountPaise': paise.round(),
      });
      amountCtrl.clear();
      categoryCtrl.clear();
      await load();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Budget saved')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save budget. Check your connection.')),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const BrutalLoading(label: 'Loading budgets…', cards: 2);
    if (error != null) return BrutalError(message: error!, onRetry: load);

    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
        BrutalCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('NEW BUDGET',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              initialValue: scope,
              decoration: const InputDecoration(labelText: 'Scope'),
              items: const ['FAMILY', 'CATEGORY', 'MEMBER']
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) => setState(() => scope = v!),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: categoryCtrl,
              decoration: const InputDecoration(hintText: 'Category (for CATEGORY scope)'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: amountCtrl,
              decoration: const InputDecoration(hintText: 'Amount ₹'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 10),
            BrutalButton(
              label: saving ? 'Saving…' : 'Save Budget',
              onPressed: saving ? null : save,
            ),
          ]),
        ),
        const SizedBox(height: 12),
        if (items.isEmpty)
          const BrutalEmpty(
            icon: Icons.savings_outlined,
            message: 'No budgets yet. Create one above to start tracking a spending limit.',
          )
        else
          ...items.map((b) {
            final paise = b['amountPaise'] is num
                ? b['amountPaise'] as num
                : (num.tryParse('${b['amountPaise']}') ?? 0);
            final spent = b['spentPaise'] is num
                ? b['spentPaise'] as num
                : (num.tryParse('${b['spentPaise']}') ?? 0);
            final ratio = paise <= 0 ? 0.0 : (spent / paise).clamp(0.0, 1.0);
            final over = spent > paise;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: brutal(border: 2, shadow: 3),
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text('${b['scope']} ${b['category'] ?? ''}',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                        overflow: TextOverflow.ellipsis),
                  ),
                  Text('₹${(paise / 100).toStringAsFixed(0)}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                ]),
                const SizedBox(height: 6),
                ClipRect(
                  child: Container(
                    height: 10,
                    decoration: BoxDecoration(
                      border: Border.all(width: 1.5),
                      color: const Color(0xFFE9E2CF),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: ratio,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 350),
                        curve: Curves.easeOutCubic,
                        color: over ? const Color(0xFFD43A6C) : const Color(0xFF1E1C10),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text('Spent ₹${(spent / 100).toStringAsFixed(0)}'
                    '${over ? ' · over budget' : ''}',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: over ? const Color(0xFF93000A) : null)),
              ]),
            );
          }),
      ]),
    );
  }
}
