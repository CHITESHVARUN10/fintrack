import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

String _rs(dynamic v) {
  final n = (v as num?)?.toDouble() ?? 0;
  return '₹${n.toStringAsFixed(0)}';
}

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
    setState(() { loading = true; error = null; });
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
    final gross = double.tryParse(grossCtrl.text.trim());
    if (gross == null || gross <= 0) {
      setState(() => calcError = 'Enter a valid gross income.');
      return;
    }
    setState(() { calcBusy = true; calcError = null; });
    try {
      final res = await ApiClient.dio.post('/tax/calculate', data: {
        'grossIncome': gross,
        'deductions': double.tryParse(deductionsCtrl.text.trim()) ?? 0,
        'regime': regime,
      });
      if (!mounted) return;
      setState(() => calcResult = Map<String, dynamic>.from(res.data as Map));
    } catch (e) {
      if (!mounted) return;
      setState(() => calcError = 'Could not calculate tax.');
    } finally {
      if (mounted) setState(() => calcBusy = false);
    }
  }

  Widget _regimeCard(String title, Map? r, bool recommended) {
    if (r == null) return const SizedBox.shrink();
    return BrutalCard(
      color: recommended ? const Color(0xFFFFE500) : Colors.white,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('$title REGIME', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
          if (recommended)
            Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(border: Border.all(width: 2)),
              child: const Text('RECOMMENDED', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
        ]),
        const SizedBox(height: 8),
        Text('Gross: ${_rs(r['grossIncome'])}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        Text('Deductions: ${_rs(r['deductions'])}', style: const TextStyle(fontSize: 12)),
        Text('Taxable: ${_rs(r['taxableIncome'])}', style: const TextStyle(fontSize: 12)),
        const SizedBox(height: 6),
        Text(_rs(r['totalTax']), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
        Text('Effective ${r['effectiveRate'] ?? 0}%', style: const TextStyle(fontSize: 11)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  const Text('TAX CALCULATOR\nCompare Old vs New regimes for FY 2025-26.',
                    style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 12),
                  BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Text('MANUAL ESTIMATE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    BrutalField(label: 'Gross income ₹ (annual)', controller: grossCtrl, hint: 'e.g. 1200000'),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(child: BrutalField(label: 'Deductions ₹ (80C)', controller: deductionsCtrl, hint: '0')),
                      const SizedBox(width: 8),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('REGIME', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                        DropdownButton<String>(value: regime, isExpanded: true,
                          items: const ['Old', 'New'].map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                          onChanged: (v) => setState(() => regime = v!)),
                      ])),
                    ]),
                    if (calcError != null) ...[
                      const SizedBox(height: 8),
                      Text(calcError!, style: const TextStyle(color: Colors.red, fontSize: 12)),
                    ],
                    const SizedBox(height: 8),
                    BrutalButton(label: calcBusy ? 'Calculating…' : 'Calculate', onPressed: calcBusy ? null : calculate),
                    if (calcResult != null) ...[
                      const SizedBox(height: 8),
                      Text('${calcResult!['regime']} regime tax: ${_rs(calcResult!['totalTax'])} '
                        '(taxable ${_rs(calcResult!['taxableIncome'])})',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                    ],
                  ])),
                  const SizedBox(height: 12),
                  _regimeCard('OLD', compare?['old'] ?? estimate?['old'], (compare?['recommended'] ?? estimate?['recommended']) == 'Old'),
                  const SizedBox(height: 10),
                  _regimeCard('NEW', compare?['new'] ?? estimate?['new'], (compare?['recommended'] ?? estimate?['recommended']) == 'New'),
                  const SizedBox(height: 12),
                  Container(padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.black, border: Border.all(width: 3)),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Expanded(child: Text('RECOMMENDED: ${(compare?['recommended'] ?? estimate?['recommended'] ?? '—')} REGIME',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12))),
                      Text('SAVE ${_rs(compare?['savings'] ?? estimate?['savings'])}',
                        style: const TextStyle(color: Color(0xFFFFE500), fontSize: 18, fontWeight: FontWeight.w900)),
                    ])),
                  const SizedBox(height: 12),
                  const Text('TAX-SAVING TIPS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  if (tips.isEmpty)
                    const BrutalCard(child: Text('No specific tips yet — add investments, insurance or loans to get personalised suggestions.'))
                  else
                    ...tips.map((t) => Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: BrutalCard(child: Text('$t', style: const TextStyle(fontSize: 13))),
                    )),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: load, child: const Icon(Icons.refresh)),
    );
  }
}
