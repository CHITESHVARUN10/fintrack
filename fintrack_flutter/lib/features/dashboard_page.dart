import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../core/vendor_name.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';
import '../widgets/spending_breakdown.dart';
import 'scan_pay_page.dart';

const _burnColors = [
  FinStackColors.brandYellow,
  FinStackColors.accentTeal,
  FinStackColors.accentPink,
  FinStackColors.accentPurple,
  FinStackColors.accentOrange,
  FinStackColors.accentBlue,
  FinStackColors.accentGreen,
];

/// Mirrors website Dashboard.tsx: individual snapshot from GET /dashboard.
/// Stat cards + monthly spend bars + normalized category/vendor rows + upcoming.
class DashboardPage extends StatefulWidget {
  const DashboardPage({
    super.key,
    this.onIncome,
    this.onActivity,
    this.onInvestments,
  });

  final VoidCallback? onIncome;
  final VoidCallback? onActivity;
  final VoidCallback? onInvestments;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

List<({String label, double value})> _chartEntries(
  List rows,
  String other, {
  bool cleanLegacyVendors = false,
}) {
  final grouped = <String, ({String label, double value})>{};
  for (final row in rows.whereType<Map>()) {
    final value = _asNum(row['value']).toDouble();
    if (!value.isFinite || value <= 0) continue;
    final original = '${row['label']}';
    final label = cleanLegacyVendors ? readableVendorName(original) : original;
    final key = label.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
    final current = grouped[key];
    grouped[key] = (
      label: current?.label ?? label,
      value: (current?.value ?? 0) + value,
    );
  }
  final entries = [...grouped.values]
    ..sort((a, b) => b.value.compareTo(a.value));
  if (entries.length <= 8) return entries;
  return [
    ...entries.take(7),
    (
      label: other,
      value: entries.skip(7).fold<double>(0, (sum, row) => sum + row.value),
    ),
  ];
}

String _occurrenceKey(Map payment) => '${payment['id']}|${payment['dueDate']}';

/// Coerces API values (num | numeric String) into num; null-safe.
num _asNum(Object? v) => v is num ? v : (num.tryParse('$v') ?? 0);

class _DashboardPageState extends State<DashboardPage> {
  Map? data;
  bool loading = true;
  String? error;
  DateTime? loadedAt;
  static const _storage = FlutterSecureStorage();
  static const _paidStorageKey = 'finstack_paid_subscription_reminders';
  static const _paidAnimation = Duration(milliseconds: 670);
  Set<String> _paid = {};
  String? _savingOccurrence;
  String? _leavingOccurrence;

  @override
  void initState() {
    super.initState();
    _loadInitial();
  }

  Future<void> _loadInitial() async {
    try {
      final stored = await _storage.read(key: _paidStorageKey);
      if (stored != null) {
        final decoded = jsonDecode(stored);
        if (decoded is List) _paid = decoded.whereType<String>().toSet();
      }
    } catch (_) {
      // Reminders stay available if local storage cannot be read.
    }
    if (mounted) await load();
  }

  Future<void> _markPaid(Map payment) async {
    if (_savingOccurrence != null) return;
    final key = _occurrenceKey(payment);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    setState(() => _savingOccurrence = key);
    try {
      final updated = {..._paid, key};
      // Keep recent occurrences without growing reminder storage indefinitely.
      final cutoff = DateTime.now().subtract(const Duration(days: 45));
      updated.removeWhere((entry) {
        final due = DateTime.tryParse(entry.split('|').last);
        return due == null || due.isBefore(cutoff);
      });
      await _storage.write(
        key: _paidStorageKey,
        value: jsonEncode(updated.toList()),
      );
      if (!mounted) return;
      setState(() {
        _paid = updated;
        _leavingOccurrence = key;
      });
      await Future<void>.delayed(
        reduceMotion ? const Duration(milliseconds: 280) : _paidAnimation,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${payment['name']} marked paid for this billing date.',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not mark the subscription paid. Try again.'),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _savingOccurrence = null;
          _leavingOccurrence = null;
        });
      }
    }
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
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ScanPayPage()));
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const BrutalLoading(label: 'Loading dashboard…');
    if (error != null) return BrutalError(message: error!, onRetry: load);
    if (data == null) {
      return const BrutalError(
        message: 'No dashboard data yet.',
        onRetry: null,
      );
    }
    final d = data!;
    final catEntries =
        ((d['transactionCategoryEntries'] as List?)?.isNotEmpty == true)
        ? (d['transactionCategoryEntries'] as List)
              .map(
                (e) => {
                  'label': '${e['label']}',
                  'value': (e['value'] as num).toDouble(),
                },
              )
              .toList()
        : ((d['monthlyBurnBreakdown'] as Map?)?.entries ?? [])
              .map(
                (e) => {'label': e.key, 'value': (e.value as num).toDouble()},
              )
              .toList();
    final burnEntries =
        catEntries.where((e) => (e['value'] as double) > 0).toList()..sort(
          (a, b) => (b['value'] as double).compareTo(a['value'] as double),
        );
    final maxBurn = burnEntries.fold<double>(
      1.0,
      (m, e) => (e['value'] as double) > m ? (e['value'] as double) : m,
    );
    final categories = _chartEntries(
      (d['transactionCategoryEntries'] as List?) ?? [],
      'Other categories',
    );
    final vendorTotals = d['transactionVendorBreakdown'];
    final vendors = _chartEntries(
      vendorTotals is Map && vendorTotals.isNotEmpty
          ? [
              for (final entry in vendorTotals.entries)
                {'label': entry.key, 'value': entry.value},
            ]
          : (d['transactionVendorEntries'] as List?) ?? [],
      'Other vendors',
      cleanLegacyVendors: d['transactionVendorNamesResolved'] != true,
    );
    final upcoming = ((d['upcomingPayments'] as List?) ?? [])
        .whereType<Map>()
        .where((payment) {
          if (payment['type'] == 'recurring') return false;
          final key = _occurrenceKey(payment);
          return payment['type'] != 'subscription' ||
              key == _leavingOccurrence ||
              !_paid.contains(key);
        })
        .toList();
    final burnMap = (d['monthlyBurnBreakdown'] as Map?) ?? {};

    String money(num v) => inr(v);
    String timeStamp(DateTime? t) {
      if (t == null) return '—';
      final hour = t.hour % 12 == 0 ? 12 : t.hour % 12;
      final min = t.minute.toString().padLeft(2, '0');
      return '$hour:$min ${t.hour >= 12 ? 'PM' : 'AM'}';
    }

    final now = loadedAt ?? DateTime.now();
    final month = monthYearLabel(now);

    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 14, 17, 28),
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: FinStackColors.accentTeal,
                  shape: BoxShape.circle,
                  border: Border.fromBorderSide(
                    BorderSide(color: FinStackColors.onSurface),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Color(0x330E8F8B),
                      blurRadius: 0,
                      spreadRadius: 3,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'UPDATED ${timeStamp(loadedAt)}',
                style: FinStackType.caption,
              ),
              const Spacer(),
              BrutalTag(label: month, color: Colors.white),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Stat(
                  label: 'Monthly income',
                  value: money(_asNum(d['monthlyIncome'])),
                  color: FinStackColors.brandYellow,
                  onTap: widget.onIncome,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(
                  label: 'Monthly outflow',
                  value: money(_asNum(d['monthlyObligations'])),
                  onTap: widget.onActivity,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Stat(
                  label: 'Investments worth',
                  value: money(
                    _asNum(d['investmentPortfolioValue']?['totalCurrentValue']),
                  ),
                  color: FinStackColors.accentCyan,
                  onTap: widget.onInvestments,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(
                  label: 'Net monthly savings',
                  value: money(_asNum(d['netMonthlyFlow'])),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          BrutalCard(
            color: FinStackColors.onSurface,
            shadowColor: FinStackColors.brandYellow,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: FinStackColors.brandYellow,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: const Icon(Icons.qr_code_2, size: 25),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  'SCAN & PAY',
                                  style: TextStyle(
                                    fontFamily: FinStackType.display,
                                    color: Colors.white,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                              ),
                              SizedBox(width: 6),
                              BrutalTag(
                                label: 'New',
                                color: FinStackColors.brandYellow,
                              ),
                            ],
                          ),
                          Text(
                            'Scan a UPI QR. Confirm. FinStack logs the vendor and payment.',
                            style: TextStyle(
                              color: Color(0xFFCFC9B2),
                              fontSize: 11.5,
                              height: 1.35,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                BrutalButton(
                  block: true,
                  label: 'Open scanner',
                  shadow: 0,
                  onPressed: _openScanner,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
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
                    final pct = maxBurn == 0
                        ? 0.0
                        : (e['value'] as double) / maxBurn;
                    final color = _burnColors[i % _burnColors.length];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Row(
                                  children: [
                                    Container(
                                      width: 10,
                                      height: 10,
                                      decoration: brutal(
                                        color: color,
                                        border: 1,
                                        shadow: 0,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: Text(
                                        '${e['label']}'.toUpperCase(),
                                        style: FinStackType.caption.copyWith(
                                          fontSize: 11.5,
                                          color: FinStackColors.onSurface,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                money(e['value'] as num),
                                style: FinStackType.amount.copyWith(
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Container(
                            height: 12,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: FinStackColors.onSurface,
                                width: 2,
                              ),
                              color: FinStackColors.surfaceVariant,
                            ),
                            child: LayoutBuilder(
                              builder: (ctx, constraints) {
                                return Stack(
                                  children: [
                                    TweenAnimationBuilder<double>(
                                      tween: Tween(
                                        begin: 0,
                                        end: pct.clamp(0.0, 1.0),
                                      ),
                                      duration:
                                          MediaQuery.disableAnimationsOf(
                                            context,
                                          )
                                          ? Duration.zero
                                          : const Duration(milliseconds: 500),
                                      curve: Curves.easeOutCubic,
                                      builder: (ctx, value, _) =>
                                          FractionallySizedBox(
                                            alignment: Alignment.centerLeft,
                                            widthFactor: value,
                                            child: DecoratedBox(
                                              decoration: BoxDecoration(
                                                color: color,
                                                border: value > 0 && value < 1
                                                    ? const Border(
                                                        right: BorderSide(
                                                          color: FinStackColors
                                                              .onSurface,
                                                          width: 2,
                                                        ),
                                                      )
                                                    : null,
                                              ),
                                              child: const SizedBox.expand(),
                                            ),
                                          ),
                                    ),
                                  ],
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                if (burnEntries.length > 5)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '+${burnEntries.length - 5} more categories',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                const Divider(),
                Row(
                  children: [
                    const BrutalTag(
                      label: 'Actual spend',
                      color: FinStackColors.brandYellow,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${money(d['transactionSpendThisMonth'] ?? d['adHocSpendThisMonth'] ?? 0)} · ${d['transactionCountThisMonth'] ?? 0} txns',
                        style: FinStackType.amount.copyWith(fontSize: 12),
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Subscriptions ${money(burnMap['Subscriptions'] ?? 0)}/mo · SIP ${money(burnMap['Investments'] ?? 0)}/mo',
                  style: FinStackType.caption.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SpendingBreakdown(
            title: 'Category breakdown',
            emptyMessage: 'No category spending this month.',
            entries: categories,
            accent: FinStackColors.accentPink,
            background: FinStackColors.surfaceContainer,
          ),
          const SizedBox(height: 12),
          SpendingBreakdown(
            title: 'Vendor breakdown',
            emptyMessage: 'No vendor spending this month.',
            entries: vendors,
            accent: FinStackColors.tertiary,
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
            for (final payment in upcoming) _upcomingCard(payment),
        ],
      ),
    );
  }

  Widget _upcomingCard(Map payment) {
    final key = _occurrenceKey(payment);
    final due = DateTime.tryParse('${payment['dueDate'] ?? ''}')?.toLocal();
    final now = DateTime.now();
    final days = due == null
        ? null
        : DateTime.utc(
            due.year,
            due.month,
            due.day,
          ).difference(DateTime.utc(now.year, now.month, now.day)).inDays;
    final label = switch (days) {
      null => 'Date unavailable',
      < 0 => 'Overdue',
      0 => 'Today',
      1 => 'Tomorrow',
      _ => 'In $days days',
    };
    final subscription = payment['type'] == 'subscription';
    final leaving = _leavingOccurrence == key;
    final pending = _savingOccurrence == key;
    final reduced = MediaQuery.disableAnimationsOf(context);
    final card = Padding(
      padding: const EdgeInsets.only(bottom: 8, right: 4),
      child: BrutalCard(
        color: leaving ? FinStackColors.surfaceContainer : Colors.white,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: brutal(
                    color: leaving
                        ? FinStackColors.accentGreen
                        : FinStackColors.brandYellow,
                    shadow: 2,
                  ),
                  alignment: Alignment.center,
                  child: leaving
                      ? const Icon(Icons.check)
                      : Text(
                          due == null ? '—' : '${due.day}',
                          style: FinStackType.amount.copyWith(fontSize: 16),
                        ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${payment['name'] ?? ''}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        due == null
                            ? 'Due date unavailable'
                            : 'Due ${dateLabel(due)}',
                        style: FinStackType.caption.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!leaving)
                  BrutalTag(
                    label: label,
                    color: (days ?? 99) <= 2
                        ? FinStackColors.errorContainer
                        : FinStackColors.surfaceContainer,
                  ),
              ],
            ),
            const Divider(
              height: 18,
              thickness: 1,
              color: FinStackColors.outlineVariant,
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    inr(_asNum(payment['amount'])),
                    style: FinStackType.amount,
                  ),
                ),
                const SizedBox(width: 8),
                if (leaving)
                  SizedBox(
                    height: 48,
                    child: Center(
                      child: Semantics(
                        liveRegion: true,
                        child: const BrutalTag(
                          label: 'Paid',
                          color: FinStackColors.accentGreen,
                        ),
                      ),
                    ),
                  )
                else if (subscription)
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      backgroundColor: FinStackColors.brandYellow,
                    ),
                    onPressed: _savingOccurrence != null || due == null
                        ? null
                        : () => _markPaid(payment),
                    icon: const Icon(Icons.check, size: 18),
                    label: Text(pending ? 'Saving…' : 'Paid'),
                  )
                else
                  BrutalButton(
                    label: 'Pay via UPI',
                    icon: Icons.qr_code_2,
                    onPressed: _openScanner,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
    return KeyedSubtree(
      key: ValueKey(key),
      child: !leaving || reduced
          ? card
          : TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: _paidAnimation,
              child: card,
              builder: (context, progress, child) {
                final strike = const Interval(
                  0,
                  .44,
                  curve: Curves.easeOutCubic,
                ).transform(progress);
                final exit = const Interval(
                  .50,
                  1,
                  curve: Curves.easeInOutCubic,
                ).transform(progress);
                return ClipRect(
                  child: Align(
                    alignment: Alignment.topCenter,
                    heightFactor: 1 - exit,
                    child: Opacity(
                      opacity: 1 - exit,
                      child: Stack(
                        children: [
                          child!,
                          Positioned.fill(
                            bottom: 8,
                            right: 4,
                            child: IgnorePointer(
                              child: CustomPaint(painter: _PaidStrike(strike)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _PaidStrike extends CustomPainter {
  const _PaidStrike(this.progress);
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final start = Offset(8, size.height * .60);
    final end = Offset(size.width - 8, size.height * .40);
    final tip = Offset.lerp(start, end, progress)!;
    final paint = Paint()
      ..strokeCap = StrokeCap.square
      ..strokeWidth = 7
      ..color = FinStackColors.onSurface;
    canvas.drawLine(start, tip, paint);
    paint
      ..strokeWidth = 3
      ..color = FinStackColors.accentGreen;
    canvas.drawLine(start, tip, paint);
  }

  @override
  bool shouldRepaint(_PaidStrike oldDelegate) =>
      oldDelegate.progress != progress;
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    this.color = Colors.white,
    this.onTap,
  });

  final String label;
  final String value;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = BrutalCard(
      color: color,
      shadow: 3,
      padding: const EdgeInsets.all(12),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 59),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              label.toUpperCase(),
              style: FinStackType.caption.copyWith(
                color: FinStackColors.onSurface,
              ),
            ),
            const SizedBox(height: 7),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value, style: FinStackType.amount),
            ),
          ],
        ),
      ),
    );
    if (onTap == null) return card;
    return Semantics(
      button: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(onTap: onTap, child: card),
      ),
    );
  }
}
