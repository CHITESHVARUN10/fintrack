import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _burnColors = [0xFFFFE500, 0xFF2EC4B6, 0xFFE8487F, 0xFF7B61FF, 0xFFFF7A45, 0xFFFFB347, 0xFF6BCB77, 0xFF4D96FF];

/// Mirrors website Dashboard.tsx: individual snapshot from GET /dashboard.
/// Stat cards + monthly spend bars + normalized category/vendor rows + upcoming.
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

/// Hamilton largest-remainder so rounded percents sum to exactly 100.
List<Map<String, dynamic>> normalizeTo100(List<Map<String, dynamic>> entries, double total) {
  if (entries.isEmpty || total <= 0) return entries.map((e) => {...e, 'percent': 0}).toList();
  final raws = entries.map((e) => (e['value'] as num).toDouble() / total * 100).toList();
  final floors = raws.map((r) => r.floor()).toList();
  final order = List.generate(entries.length, (i) => i)..sort((a, b) => (raws[b] - floors[b]).compareTo(raws[a] - floors[a]));
  var remaining = 100 - floors.fold<int>(0, (a, b) => a + b);
  final pct = List<int>.from(floors);
  for (var i = 0; i < remaining && i < order.length; i++) {
    pct[order[i]] += 1;
  }
  return List.generate(entries.length, (i) => {...entries[i], 'percent': pct[i], 'raw': raws[i]});
}

class _DashboardPageState extends State<DashboardPage> {
  Map? data;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final res = await ApiClient.dio.get('/dashboard');
      setState(() => data = res.data);
    } catch (e) {
      setState(() => error = 'Could not load dashboard.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null || data == null) {
      return ListView(padding: const EdgeInsets.all(16), children: [
        BrutalCard(child: Text(error ?? 'No data.')),
        const SizedBox(height: 8),
        BrutalButton(label: 'Retry', onPressed: load),
      ]);
    }
    final d = data!;
    final catEntries = ((d['transactionCategoryEntries'] as List?)?.isNotEmpty == true)
        ? (d['transactionCategoryEntries'] as List).map((e) => {'label': '${e['label']}', 'value': (e['value'] as num).toDouble()}).toList()
        : ((d['monthlyBurnBreakdown'] as Map?)?.entries ?? []).map((e) => {'label': e.key, 'value': (e.value as num).toDouble()}).toList();
    final burnEntries = catEntries.where((e) => (e['value'] as double) > 0).toList();
    final burnTotal = burnEntries.fold<double>(0, (s, e) => s + (e['value'] as double));
    final maxBurn = burnEntries.fold<double>(1, (m, e) => (e['value'] as double) > m ? (e['value'] as double) : m);
    final normCats = normalizeTo100(burnEntries, burnTotal);

    final vendorEntries = ((d['transactionVendorEntries'] as List?) ?? []).map((e) => {'label': '${e['label']}', 'value': (e['value'] as num).toDouble()}).toList();
    final vendorTotal = vendorEntries.fold<double>(0, (s, e) => s + (e['value'] as double));
    final normVendors = normalizeTo100(vendorEntries, vendorTotal);

    final upcoming = (d['upcomingPayments'] as List?) ?? [];
    final burnMap = (d['monthlyBurnBreakdown'] as Map?) ?? {};

    String money(num v) => '₹${v.toStringAsFixed(0)}';

    return RefreshIndicator(
      onRefresh: load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('OVERVIEW', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Stat(label: 'Monthly Income', value: money(d['monthlyIncome'] ?? 0), color: const Color(0xFFFFE500)),
          _Stat(label: 'Monthly Outflow', value: money(d['monthlyObligations'] ?? 0)),
          _Stat(label: 'Investments Worth', value: money((d['investmentPortfolioValue']?['totalCurrentValue'] ?? 0))),
          _Stat(label: 'Net Monthly Savings', value: money(d['netMonthlyFlow'] ?? 0)),
        ]),
        const SizedBox(height: 12),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('MONTHLY SPEND BREAKDOWN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const Text('From your transactions this month (individual)', style: TextStyle(fontSize: 10)),
          const SizedBox(height: 8),
          if (burnEntries.isEmpty) const Text('No transactions this month — import or add one.')
          else ...burnEntries.map((e) {
            final pct = maxBurn == 0 ? 0.0 : (e['value'] as double) / maxBurn;
            return Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Expanded(child: Text('${e['label']}'.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700))),
                Text(money(e['value'] as num), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
              ]),
              const SizedBox(height: 4),
              Container(
                height: 12,
                width: double.infinity,
                decoration: BoxDecoration(border: Border.all(width: 2)),
                child: LayoutBuilder(builder: (ctx, constraints) {
                  final w = (constraints.maxWidth * pct).clamp(0.0, constraints.maxWidth).toDouble();
                  return Stack(children: [
                    Container(color: const Color(0xFFE9E2CF)),
                    Container(width: w, color: Colors.black),
                  ]);
                }),
              ),
            ]));
          }),
          const Divider(),
          Text('Actual Spend: ${money(d['transactionSpendThisMonth'] ?? d['adHocSpendThisMonth'] ?? 0)} · ${d['transactionCountThisMonth'] ?? 0} txns',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('Subscriptions: ${money(burnMap['Subscriptions'] ?? 0)}/mo · Recurring: ${money(burnMap['Recurring'] ?? 0)}/mo · SIP: ${money(burnMap['Investments'] ?? 0)}/mo',
            style: const TextStyle(fontSize: 10)),
        ])),
        const SizedBox(height: 12),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('CATEGORY BREAKDOWN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (normCats.isEmpty) const Text('No data.')
          else ...normCats.asMap().entries.map((en) {
            final i = en.key; final c = en.value;
            return Container(margin: const EdgeInsets.only(bottom: 6), padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(border: Border.all(width: 2)),
              child: Row(children: [
                Container(width: 12, height: 12, color: Color(_burnColors[i % _burnColors.length])),
                const SizedBox(width: 8),
                Expanded(child: Text('${c['label']}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                Text('${c['percent']}%', style: const TextStyle(fontSize: 11)),
              ]));
          }),
        ])),
        const SizedBox(height: 12),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('VENDOR BREAKDOWN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const Text('Your top vendors this month', style: TextStyle(fontSize: 10)),
          const SizedBox(height: 8),
          if (normVendors.isEmpty) const Text('No vendor spend yet.')
          else ...normVendors.asMap().entries.map((en) {
            final i = en.key; final v = en.value;
            final label = '${v['label']}';
            final display = label.length > 28 ? '${label.substring(0, 20)}…${label.substring(label.length - 6)}' : label;
            return Container(margin: const EdgeInsets.only(bottom: 6), padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(border: Border.all(width: 2)),
              child: Row(children: [
                Container(width: 10, height: 10, color: Color(_burnColors[i % _burnColors.length])),
                const SizedBox(width: 8),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(display, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                  Text('${v['percent']}% · ${money(v['value'] as num)}', style: const TextStyle(fontSize: 9)),
                ])),
                Text(money(v['value'] as num), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
              ]));
          }),
        ])),
        const SizedBox(height: 12),
        const Text('UPCOMING PAYMENTS (7 DAYS)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (upcoming.isEmpty) const BrutalCard(child: Text('No payments due in the next 7 days.'))
        else ...upcoming.map((p) {
          final due = DateTime.tryParse('${p['dueDate'] ?? ''}');
          final days = due == null ? 99 : due.difference(DateTime.now()).inDays;
          final action = days <= 5 ? 'Pay Now' : 'Schedule';
          return Container(margin: const EdgeInsets.only(bottom: 8), child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Expanded(child: Text('${p['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700))),
              Text('Due ${('${p['dueDate'] ?? ''}').substring(0, 10)}', style: const TextStyle(fontSize: 10)),
            ]),
            const SizedBox(height: 4),
            Text(money(p['amount'] ?? 0), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            BrutalButton(label: action, onPressed: () {}),
          ])));
        }),
      ]),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label; final String value; final Color color;
  const _Stat({required this.label, required this.value, this.color = Colors.white});
  @override
  Widget build(BuildContext context) => Container(
    width: (MediaQuery.of(context).size.width - 48) / 2,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(color: color, border: Border.all(width: 3), boxShadow: const [BoxShadow(offset: Offset(3, 3))]),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label.toUpperCase(), style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
    ]),
  );
}
