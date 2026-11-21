import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

/// Mirrors website Tax.tsx: GET /tax/estimate (auto-aggregated, no params),
/// POST /tax/calculate {grossIncome, deductions, regime}, GET /tax/compare,
/// GET /tax/tips (string array). Same /tax/* relative paths via ApiClient.dio.
class TaxPage extends StatefulWidget {
  const TaxPage({super.key});
  @override
  State<TaxPage> createState() => _TaxPageState();
}

class _TaxPageState extends State<TaxPage> {
  Map<String, dynamic>? estimate;
  Map<String, dynamic>? compare;
  List tips = [];
  bool loading = true;
  String? error;

  final grossCtrl = TextEditingController();
  final deductionsCtrl = TextEditingController(text: '0');
  String regime = 'New';
  Map<String, dynamic>? calcResult;
  bool calcBusy = false;
  String? calcError;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    grossCtrl.dispose();
    deductionsCtrl.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.dio.get('/tax/estimate'),
        ApiClient.dio.get('/tax/compare'),
        ApiClient.dio.get('/tax/tips'),
      ]);
      if (!mounted) return;
      setState(() {
        estimate = Map<String, dynamic>.from(results[0].data as Map);
        compare = Map<String, dynamic>.from(results[1].data as Map);
        tips = (results[2].data as List?) ?? [];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load tax estimate.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> calculate() async {
    if (calcBusy) return;
    dismissKeyboard(context);
    final gross = double.tryParse(grossCtrl.text.trim());
    if (gross == null || gross <= 0) {
      setState(() => calcError = 'Enter a valid gross income.');
      return;
    }
    setState(() {
      calcBusy = true;
      calcError = null;
    });
    try {
      final res = await ApiClient.dio.post(
        '/tax/calculate',
        data: {
          'grossIncome': gross,
          'deductions': double.tryParse(deductionsCtrl.text.trim()) ?? 0,
          'regime': regime,
        },
      );
      if (!mounted) return;
      setState(() => calcResult = Map<String, dynamic>.from(res.data as Map));
    } catch (e) {
      if (!mounted) return;
      setState(() => calcError = 'Could not calculate tax.');
    } finally {
      if (mounted) setState(() => calcBusy = false);
    }
  }

  Future<void> _syncEstimate() async {
    dismissKeyboard(context);
    await load();
    if (!mounted || error != null) return;
    final synced = estimate;
    grossCtrl.text = '${synced?['grossIncome'] ?? ''}';
    final deductions = synced?['deductions'];
    deductionsCtrl.text = deductions is Map
        ? '${deductions['section80C'] ?? 0}'
        : '0';
    setState(() {
      regime = synced?['recommended'] == 'Old' ? 'Old' : 'New';
      calcResult = null;
      calcError = null;
    });
  }

  Widget _regimeCard(String label, Map data, bool recommended) {
    return BrutalCard(
      color: recommended ? FinStackColors.brandYellow : Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 6,
        children: [
          Row(
            spacing: 8,
            children: [
              Expanded(
                child: Text(
                  '$label REGIME',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (recommended)
                const BrutalTag(label: 'Recommended', color: Colors.white),
            ],
          ),
          for (final field in const [
            ('Gross', 'grossIncome'),
            ('Deductions', 'deductions'),
            ('Taxable', 'taxableIncome'),
          ])
            Text(
              '${field.$1}: ${inr((data[field.$2] as num?) ?? 0)}',
              style: FinStackType.caption,
            ),
          Text(
            inr((data['totalTax'] as num?) ?? 0),
            style: FinStackType.amount.copyWith(fontSize: 26),
          ),
          Text(
            'Effective ${data['effectiveRate'] ?? 0}%',
            style: FinStackType.caption,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final recommendation = compare?['recommended'] ?? estimate?['recommended'];
    final savings = (compare?['savings'] ?? estimate?['savings']) as num?;
    final oldRegime = compare?['old'] ?? estimate?['old'];
    final newRegime = compare?['new'] ?? estimate?['new'];
    return WorkspaceScaffold(
      title: 'Tax',
      action: BrutalButton(
        label: 'Sync',
        icon: Icons.sync,
        onPressed: loading || calcBusy ? null : _syncEstimate,
      ),
      body: loading
          ? const BrutalLoading(label: 'Loading tax estimates…')
          : error != null
          ? BrutalError(message: error!, onRetry: load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
              children: [
                const WorkspaceIntro(
                  'Tax calculator',
                  'Compare the Old and New regimes for FY 2025–26.',
                ),
                const SizedBox(height: 12),
                _manualEstimate(),
                if (oldRegime is Map) ...[
                  const SizedBox(height: 12),
                  _regimeCard('OLD', oldRegime, recommendation == 'Old'),
                ],
                if (newRegime is Map) ...[
                  const SizedBox(height: 12),
                  _regimeCard('NEW', newRegime, recommendation == 'New'),
                ],
                if (recommendation != null && savings != null) ...[
                  const SizedBox(height: 12),
                  WorkspaceTotal(
                    label: 'Recommended: $recommendation regime',
                    value: 'Save ${inr(savings)}',
                  ),
                ],
                const SizedBox(height: 16),
                const BrutalSectionTitle(title: 'Tax-saving tips'),
                const SizedBox(height: 8),
                if (tips.isEmpty)
                  const BrutalCard(
                    color: FinStackColors.surfaceContainer,
                    child: Text(
                      'Add investments to get personalised suggestions.',
                    ),
                  )
                else
                  for (final tip in tips)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: BrutalCard(child: Text('$tip')),
                    ),
              ],
            ),
    );
  }

  Widget _manualEstimate() {
    final result = calcResult;
    return BrutalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          const BrutalSectionTitle(title: 'Manual estimate'),
          BrutalField(
            label: 'Gross income ₹ (annual)',
            controller: grossCtrl,
            hint: 'e.g. 1200000',
            keyboardType: TextInputType.number,
          ),
          Row(
            spacing: 8,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: BrutalField(
                  label: 'Deductions ₹ (80C)',
                  controller: deductionsCtrl,
                  hint: '0',
                  keyboardType: TextInputType.number,
                ),
              ),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: regime,
                  key: ValueKey(regime),
                  decoration: const InputDecoration(labelText: 'Regime'),
                  items: const [
                    DropdownMenuItem(value: 'New', child: Text('New')),
                    DropdownMenuItem(value: 'Old', child: Text('Old')),
                  ],
                  onChanged: (value) {
                    if (value != null) setState(() => regime = value);
                  },
                ),
              ),
            ],
          ),
          if (calcError != null)
            Text(
              calcError!,
              style: const TextStyle(color: FinStackColors.onErrorContainer),
            ),
          BrutalButton(
            label: calcBusy ? 'Calculating…' : 'Calculate',
            block: true,
            onPressed: calcBusy ? null : calculate,
          ),
          if (result != null)
            Semantics(
              liveRegion: true,
              child: BrutalCard(
                color: FinStackColors.surfaceContainer,
                border: 2,
                shadow: 0,
                padding: const EdgeInsets.all(9),
                child: Text(
                  "${result['regime']} regime tax: ${inr((result['totalTax'] as num?) ?? 0)} "
                  "(taxable ${inr((result['taxableIncome'] as num?) ?? 0)})",
                  style: FinStackType.caption,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
