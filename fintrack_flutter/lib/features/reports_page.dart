import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

/// Mirrors website Reports.tsx + backend/server/routes/reports/index.js.
/// Reports are read-only generated downloads (PDF/XLSX blobs, no stored history):
/// GET /reports/monthly?month=&year=&format=, GET /reports/annual?year=&format=,
/// GET /reports/category?from=&to=&format=, GET /reports/tax?year= (PDF only),
/// GET /reports/family?from=&to=&format=. Month/year selectors + summary cards.
class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportDef {
  final String kind;
  final String title;
  final String desc;
  const _ReportDef(this.kind, this.title, this.desc);
}

const _reportKinds = [
  _ReportDef('monthly', 'Monthly Summary', 'Income, obligations & expenses for one month.'),
  _ReportDef('annual', 'Annual Summary', 'Full-year income, obligations & trends.'),
  _ReportDef('category', 'Category Breakdown', 'Spending by category over a date range.'),
  _ReportDef('tax', 'Tax Summary', 'Deductions, liabilities & regime pick (PDF only).'),
  _ReportDef('family', 'Family Report', 'Unified ledger: member/category/vendor/mode shares.'),
];

class _ReportsPageState extends State<ReportsPage> {
  late final TextEditingController monthCtrl;
  late final TextEditingController yearCtrl;
  late final TextEditingController fromCtrl;
  late final TextEditingController toCtrl;
  String format = 'pdf';
  final Map<String, String> status = {};
  final Set<String> busy = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    monthCtrl = TextEditingController(text: '${now.month}');
    yearCtrl = TextEditingController(text: '${now.year}');
    fromCtrl = TextEditingController(text: '${now.year}-${now.month.toString().padLeft(2, '0')}-01');
    toCtrl = TextEditingController(text: '${now.year}-${now.month.toString().padLeft(2, '0')}-28');
  }

  @override
  void dispose() {
    monthCtrl.dispose();
    yearCtrl.dispose();
    fromCtrl.dispose();
    toCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> _paramsFor(String kind) {
    final year = int.tryParse(yearCtrl.text.trim()) ?? DateTime.now().year;
    switch (kind) {
      case 'monthly':
        return {'month': int.tryParse(monthCtrl.text.trim()) ?? DateTime.now().month, 'year': year};
      case 'annual':
      case 'tax':
        return {'year': year};
      case 'category':
      case 'family':
        return {'from': fromCtrl.text.trim(), 'to': toCtrl.text.trim()};
      default:
        return {};
    }
  }

  Future<void> generate(String kind) async {
    final params = _paramsFor(kind);
    final fmt = kind == 'tax' ? 'pdf' : format;
    setState(() { busy.add(kind); status.remove(kind); });
    try {
      final res = await ApiClient.dio.get('/reports/$kind',
        queryParameters: {...params, 'format': fmt},
        options: Options(responseType: ResponseType.bytes));
      final bytes = (res.data as List?)?.length ?? 0;
      if (!mounted) return;
      setState(() => status[kind] = 'Ready: $kind report ($fmt, ${(bytes / 1024).toStringAsFixed(1)} KB).');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(status[kind]!)));
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.response?.data is Map
          ? '${(e.response!.data as Map)['error'] ?? 'Could not generate the report.'}'
          : 'Could not generate the report. Please check the date range and try again.';
      setState(() => status[kind] = msg);
    } catch (_) {
      if (!mounted) return;
      setState(() => status[kind] = 'Could not generate the report. Please check the date range and try again.');
    } finally {
      if (mounted) setState(() => busy.remove(kind));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('REPORTS\nGenerate and download financial insights (read-only).',
          style: TextStyle(fontSize: 12)),
        const SizedBox(height: 12),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('MONTH / YEAR', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'Month (1-12)', controller: monthCtrl, hint: '4')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'Year', controller: yearCtrl, hint: '2026')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'From (YYYY-MM-DD)', controller: fromCtrl, hint: '2026-04-01')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'To (YYYY-MM-DD)', controller: toCtrl, hint: '2026-04-30')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            const Text('FORMAT  ', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: format,
              items: const ['pdf', 'excel'].map((f) => DropdownMenuItem(value: f, child: Text(f.toUpperCase()))).toList(),
              onChanged: (v) => setState(() => format = v!)),
          ]),
          const Text('Monthly / Annual / Tax use Month+Year. Category / Family use From–To.',
            style: TextStyle(fontSize: 11)),
        ])),
        const SizedBox(height: 12),
        ..._reportKinds.map((r) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.title.toUpperCase(), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
            Text(r.desc, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Expanded(child: Text(status[r.kind] ?? 'Not generated yet.',
                style: const TextStyle(fontSize: 11))),
              const SizedBox(width: 8),
              BrutalButton(
                label: busy.contains(r.kind) ? '…' : 'Generate',
                onPressed: busy.contains(r.kind) ? null : () => generate(r.kind),
              ),
            ]),
          ])),
        )),
        const BrutalCard(child: Text(
          'Reports are generated on demand from your live data and are not stored.',
          style: TextStyle(fontSize: 12))),
      ]),
    );
  }
}
