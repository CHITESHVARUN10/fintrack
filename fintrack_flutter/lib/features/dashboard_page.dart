import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';
import 'scan_pay_page.dart';

const _burnColors = [
  0xFFFFE500,
  0xFF2EC4B6,
  0xFFE8487F,
  0xFF7B61FF,
  0xFFFF7A45,
  0xFFFFB347,
  0xFF6BCB77,
  0xFF4D96FF,
];

/// Mirrors website Dashboard.tsx: individual snapshot from GET /dashboard.
/// Stat cards + monthly spend bars + normalized category/vendor rows + upcoming.
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

/// Hamilton largest-remainder so rounded percents sum to exactly 100.
List<Map<String, dynamic>> normalizeTo100(
    List<Map<String, dynamic>> entries, double total) {
  if (entries.isEmpty || total <= 0) {
    return entries.map((e) => {...e, 'percent': 0}).toList();
  }
  final raws =
      entries.map((e) => (e['value'] as num).toDouble() / total * 100).toList();
  final floors = raws.map((r) => r.floor()).toList();
  final order = List.generate(entries.length, (i) => i)
    ..sort((a, b) => (raws[b] - floors[b]).compareTo(raws[a] - floors[a]));
  final remaining = 100 - floors.fold<int>(0, (a, b) => a + b);
  final pct = List<int>.from(floors);
  for (var i = 0; i < remaining && i < order.length; i++) {
    pct[order[i]] += 1;
  }
  return List.generate(
      entries.length, (i) => {...entries[i], 'percent': pct[i], 'raw': raws[i]});
}

/// Coerces API values (num | numeric String) into num; null-safe.
num _asNum(Object? v) => v is num ? v : (num.tryParse('$v') ?? 0);

class _DashboardPageState extends State<DashboardPage> {
  Map? data;
  bool loading = true;
  String? error;
  DateTime? loadedAt;

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
      final res = await ApiClient.dio.get('/dashboard');
      if (!mounted) return;
      setState(() {
        data = res.data;
        loadedAt = DateTime.now();
      });
    } catch (_) {
      if (mounted) setState(() => error = 'Could not load dashboard.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _openScanner() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ScanPayPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const BrutalLoading(label: 'Loading dashboard…');
    if (error != null) return BrutalError(message: error!, onRetry: load);
    if (data == null) {
      return const BrutalError(message: 'No dashboard data yet.', onRetry: null);
    }
    final d = data!;
    final catEntries =
        ((d['transactionCategoryEntries'] as List?)?.isNotEmpty == true)
            ? (d['transactionCategoryEntries'] as List)
                .map((e) => {
                      'label': '${e['label']}',
                      'value': (e['value'] as num).toDouble()
                    })
                .toList()
            : ((d['monthlyBurnBreakdown'] as Map?)?.entries ?? [])
                .map((e) => {
                      'label': e.key,
                      'value': (e.value as num).toDouble()
                    })
                .toList();
    final burnEntries = catEntries.where((e) => (e['value'] as double) > 0).toList()
      ..sort((a, b) => (b['value'] as double).compareTo(a['value'] as double));
    final burnTotal =
        burnEntries.fold<double>(0, (s, e) => s + (e['value'] as double));
    final maxBurn = burnEntries.fold<double>(
        1.0,
        (m, e) =>
            (e['value'] as double) > m ? (e['value'] as double) : m);
    final normCats = normalizeTo100(burnEntries, burnTotal);

    final vendorEntries = ((d['transactionVendorEntries'] as List?) ?? [])
        .map((e) => {
              'label': '${e['label']}',
              'value': (e['value'] as num).toDouble()
            })
        .toList();
    final vendorTotal =
        vendorEntries.fold<double>(0, (s, e) => s + (e['value'] as double));
    final normVendors = normalizeTo100(vendorEntries, vendorTotal);

    final upcoming = (d['upcomingPayments'] as List?) ?? [];
    final burnMap = (d['monthlyBurnBreakdown'] as Map?) ?? {};

    String money(num v) => inr(v);
    String timeStamp(DateTime? t) {
      if (t == null) return '—';
      final hour = t.hour % 12 == 0 ? 12 : t.hour % 12;
      final min = t.minute.toString().padLeft(2, '0');
      return '$hour:$min ${t.hour >= 12 ? 'PM' : 'AM'}';
    }

    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          Row(children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: FinStackColors.chartTeal,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Color(0x330E8F8B),
                    blurRadius: 0,
                    spreadRadius: 3,
                  )
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'UPDATED ${timeStamp(loadedAt)}',
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.9,
                color: FinStackColors.onSurfaceVariant,
              ),
            ),
            const Spacer(),
            const BrutalTag(label: 'Individual', color: Colors.white),
          ]),
          const SizedBox(height: 12),
          // Stat card grid — cell width derived from actual constraints.
          Builder(builder: (context) {
            final cw = MediaQuery.sizeOf(context).width - 32;
            final cell = ((cw - 8) / 2).clamp(120.0, 280.0).toDouble();
            return Wrap(spacing: 8, runSpacing: 8, children: [
              SizedBox(
                width: cell,
                child: _Stat(
                  label: 'Monthly Income',
                  value: money(_asNum(d['monthlyIncome'])),
                  icon: Icons.account_balance_wallet,
                  color: FinStackColors.brandYellow,
                ),
              ),
              SizedBox(
                width: cell,
                child: _Stat(
                  label: 'Monthly Outflow',
                  value: money(_asNum(d['monthlyObligations'])),
                  icon: Icons.shopping_cart_outlined,
                ),
              ),
              SizedBox(
                width: cell,
                child: _Stat(
                  label: 'Investments Worth',
                  value: money(
                      _asNum(d['investmentPortfolioValue']?['totalCurrentValue'])),
                  icon: Icons.show_chart,
                  color: FinStackColors.tertiary,
                ),
              ),
              SizedBox(
                width: cell,
                child: _Stat(
                  label: 'Net Monthly Savings',
                  value: money(_asNum(d['netMonthlyFlow'])),
                  icon: Icons.savings_outlined,
                ),
              ),
            ]);
          }),
          const SizedBox(height: 12),
          BrutalCard(
            color: FinStackColors.onSurface,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: FinStackColors.brandYellow,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                  child: const Icon(Icons.qr_code_scanner, size: 24),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text(
                        'SCAN & PAY',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.2,
                        ),
                      ),
                      SizedBox(width: 6),
                      BrutalTag(label: 'New', color: FinStackColors.brandYellow),
                    ]),
                    Text(
                      'Scan a UPI QR. Confirm. FinStack logs the vendor and payment.',
                      style: TextStyle(color: Color(0xFFCFC9B2), fontSize: 10, height: 1.35),
                    ),
                  ]),
                ),
              ]),
              const SizedBox(height: 10),
              BrutalButton(
                block: true,
                label: 'Open scanner',
                icon: Icons.qr_code_2,
                onPressed: _openScanner,
              ),
            ]),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              BrutalSectionTitle(
                title: 'Monthly spend breakdown',
                subtitle: 'From your transactions this month (individual)',
                trailing: const BrutalTag(
                  label: 'Top 5',
                  color: FinStackColors.surfaceContainer,
                ),
              ),
              const SizedBox(height: 12),
              if (burnEntries.isEmpty)
                const Text('No transactions this month — import or add one.')
              else
                ...burnEntries.take(5).toList().asMap().entries.map((entry) {
                  final i = entry.key;
                  final e = entry.value;
                  final pct =
                      maxBurn == 0 ? 0.0 : (e['value'] as double) / maxBurn;
                  final color = Color(_burnColors[i % _burnColors.length]);
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Column(children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Expanded(
                          child: Row(children: [
                            Container(width: 9, height: 9, color: color),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                '${e['label']}'.toUpperCase(),
                                style: const TextStyle(
                                    fontSize: 11, fontWeight: FontWeight.w800),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ]),
                        ),
                        Text(money(e['value'] as num),
                            style: const TextStyle(
                                fontSize: 11, fontWeight: FontWeight.w800)),
                      ]),
                      const SizedBox(height: 4),
                      Container(
                        height: 12,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          border: Border.all(color: FinStackColors.onSurface, width: 2),
                          color: FinStackColors.surfaceVariant,
                        ),
                        child: LayoutBuilder(builder: (ctx, constraints) {
                          return Stack(children: [
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: pct.clamp(0.0, 1.0)),
                              duration: const Duration(milliseconds: 500),
                              curve: Curves.easeOutCubic,
                              builder: (ctx, value, _) => FractionallySizedBox(
                                alignment: Alignment.centerLeft,
                                widthFactor: value,
                                child: Container(color: color),
                              ),
                            ),
                          ]);
                        }),
                      ),
                    ]),
                  );
                }),
              if (burnEntries.length > 5)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('+${burnEntries.length - 5} more categories',
                      style: const TextStyle(
                          fontSize: 10, fontWeight: FontWeight.w700)),
                ),
              const Divider(),
              Row(children: [
                const BrutalTag(label: 'Actual spend', color: FinStackColors.brandYellow),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${money(d['transactionSpendThisMonth'] ?? d['adHocSpendThisMonth'] ?? 0)} · ${d['transactionCountThisMonth'] ?? 0} txns',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ]),
              const SizedBox(height: 6),
              Text(
                'Subscriptions ${money(burnMap['Subscriptions'] ?? 0)}/mo · Recurring ${money(burnMap['Recurring'] ?? 0)}/mo · SIP ${money(burnMap['Investments'] ?? 0)}/mo',
                style: const TextStyle(fontSize: 10),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            color: FinStackColors.surfaceContainer,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const BrutalSectionTitle(
                title: 'Category breakdown',
                subtitle: 'Share of this month’s spend',
                accent: FinStackColors.accentPink,
              ),
              const SizedBox(height: 12),
              if (normCats.isEmpty)
                const Text('No data.')
              else
                ...normCats.asMap().entries.map((en) {
                  final i = en.key;
                  final c = en.value;
                  final color = Color(_burnColors[i % _burnColors.length]);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: FinStackColors.onSurface, width: 2),
                    ),
                    child: Row(children: [
                      Container(width: 12, height: 12, color: color),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('${c['label']}',
                            style: const TextStyle(
                                fontSize: 11, fontWeight: FontWeight.w700),
                            overflow: TextOverflow.ellipsis),
                      ),
                      Text('${c['percent']}%',
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w900)),
                    ]),
                  );
                }),
            ]),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const BrutalSectionTitle(
                title: 'Vendor breakdown',
                subtitle: 'Your top vendors this month',
                accent: FinStackColors.tertiary,
              ),
              const SizedBox(height: 12),
              if (normVendors.isEmpty)
                const Text('No vendor spend yet.')
              else
                ...normVendors.asMap().entries.map((en) {
                  final i = en.key;
                  final v = en.value;
                  final color = Color(_burnColors[i % _burnColors.length]);
                  final label = '${v['label']}';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 7),
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      border: Border.all(color: FinStackColors.onSurface, width: 2),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Container(
                          width: 22,
                          height: 22,
                          color: color,
                          alignment: Alignment.center,
                          child: Text('${i + 1}',
                              style: const TextStyle(
                                  fontSize: 10, fontWeight: FontWeight.w900)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(label,
                              style: const TextStyle(
                                  fontSize: 11, fontWeight: FontWeight.w700),
                              overflow: TextOverflow.ellipsis),
                        ),
                        Text(money(v['value'] as num),
                            style: const TextStyle(
                                fontSize: 11, fontWeight: FontWeight.w800)),
                      ]),
                      const SizedBox(height: 6),
                      Container(
                        height: 6,
                        decoration: BoxDecoration(
                          color: FinStackColors.surfaceVariant,
                          border: Border.all(color: FinStackColors.onSurface, width: 1),
                        ),
                        child: FractionallySizedBox(
                          alignment: Alignment.centerLeft,
                          widthFactor: ((v['percent'] as num) / 100).clamp(0.0, 1.0),
                          child: ColoredBox(color: color),
                        ),
                      ),
                    ]),
                  );
                }),
            ]),
          ),
          const SizedBox(height: 16),
          const BrutalSectionTitle(
            title: 'Upcoming payments',
            subtitle: 'Next 7 days',
            accent: FinStackColors.tertiary,
          ),
          const SizedBox(height: 8),
          if (upcoming.isEmpty)
            const BrutalEmpty(
              icon: Icons.event_available,
              message: 'No payments due in the next 7 days.',
            )
          else
            ...upcoming.map((p) {
              final due = DateTime.tryParse('${p['dueDate'] ?? ''}');
              final days = due == null ? 99 : due.difference(DateTime.now()).inDays;
              final label = days < 0
                  ? 'OVERDUE'
                  : days == 0
                      ? 'TODAY'
                      : 'IN $days DAYS';
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                child: BrutalCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: FinStackColors.brandYellow,
                          border: Border.all(color: FinStackColors.onSurface, width: 2),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          due == null ? '—' : '${due.day}',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w900),
                        ),
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${p['name'] ?? ''}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 13),
                              overflow: TextOverflow.ellipsis),
                          Text('Due ${due != null ? dateLabel(due) : 'unavailable'}',
                              style: const TextStyle(fontSize: 10)),
                        ]),
                      ),
                      BrutalTag(
                        label: label,
                        color: days <= 2
                            ? FinStackColors.errorContainer
                            : FinStackColors.surfaceContainer,
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      Text(money(_asNum(p['amount'])),
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w900)),
                      const Spacer(),
                      BrutalButton(
                        label: 'Pay via UPI',
                        icon: Icons.qr_code_2,
                        onPressed: _openScanner,
                      ),
                    ]),
                  ]),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;
  const _Stat({
    required this.label,
    required this.value,
    required this.icon,
    this.color = Colors.white,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(
          color: color,
          border: Border.all(color: FinStackColors.onSurface, width: 3),
          boxShadow: const [
            BoxShadow(
              color: FinStackColors.onSurface,
              offset: Offset(3, 3),
              blurRadius: 0,
            )
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text(label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
            ),
            Icon(icon, size: 16),
          ]),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          ),
        ]),
      );
}
