import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/finstack_theme.dart';
import '../core/auth_state.dart';
import '../widgets/brutal.dart';
import 'dashboard_page.dart';
import 'transactions_page.dart';
import 'income_page.dart';
import 'family_page.dart';
import 'import_page.dart';
import 'budgets_page.dart';
import 'family_dashboard_page.dart';
import 'profile_page.dart';
import 'vendors_page.dart';
import 'subscriptions_page.dart';
import 'recurring_page.dart';
import 'investments_page.dart';
import 'tax_page.dart';
import 'reports_page.dart';
import 'notifications_page.dart';
import 'settings_page.dart';
import 'scan_pay_page.dart';

class _Dest {
  final String label;
  final IconData icon;
  final Widget Function() page;
  const _Dest(this.label, this.icon, this.page);
}

/// Page instances are created lazily by the shell — see visited-tracking
/// in _ShellState so cold-start fires only the dashboard's requests, not
/// 20 screens' worth at once.
final _dests = [
  _Dest('Overview', Icons.home, () => DashboardPage()),
  _Dest('Transactions', Icons.receipt_long, () => TransactionsPage()),
  _Dest('Income', Icons.wallet, () => IncomePage()),
  _Dest('Family Dashboard', Icons.analytics, () => FamilyDashboardPage()),
  _Dest('Members', Icons.group, () => FamilyPage()),
  _Dest('Import', Icons.upload_file, () => ImportPageWidget()),
  _Dest('Budgets', Icons.savings, () => BudgetsPage()),
  _Dest('Vendors', Icons.store, () => VendorsPage()),
  _Dest('Subscriptions', Icons.autorenew, () => SubscriptionsPage()),
  _Dest('Recurring', Icons.event_repeat, () => RecurringPage()),
  _Dest('Investments', Icons.trending_up, () => InvestmentsPage()),
  _Dest('Tax', Icons.calculate, () => TaxPage()),
  _Dest('Reports', Icons.bar_chart, () => ReportsPage()),
  _Dest('Notifications', Icons.notifications, () => NotificationsPage()),
  _Dest('Profile', Icons.person, () => ProfilePage()),
  _Dest('Settings', Icons.settings, () => SettingsPage()),
];

class Shell extends ConsumerStatefulWidget {
  const Shell({super.key});
  @override
  ConsumerState<Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<Shell> {
  int idx = 0;
  final Set<int> visited = {0};

  void _go(int i) {
    setState(() {
      idx = i;
      visited.add(i);
    });
    Navigator.of(context).pop();
  }

  void _openScan() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ScanPayPage()),
    );
  }

  void _openScanFromDrawer() {
    Navigator.of(context).pop();
    Future.microtask(() {
      if (mounted) _openScan();
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final name = '${user?['name'] ?? 'FinStack'}';
    final role = '${user?['role'] ?? 'member'}';
    final initials = name.trim().isEmpty
        ? '?'
        : name
            .trim()
            .split(RegExp(r'\s+'))
            .map((p) => p[0])
            .take(2)
            .join()
            .toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: FinStackColors.brandYellow,
              border: Border.all(color: FinStackColors.onSurface, width: 2),
            ),
            alignment: Alignment.center,
            child: const Text(
              'F',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, height: 1),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              _dests[idx].label.toUpperCase(),
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: BrutalIconButton(
              icon: Icons.qr_code_scanner,
              tooltip: 'Scan & Pay',
              onPressed: _openScan,
            ),
          ),
        ],
      ),
      drawer: Drawer(
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(
          side: BorderSide(color: FinStackColors.onSurface, width: 3),
        ),
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BrutalGrid(
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: FinStackColors.onSurface, width: 3),
                    ),
                  ),
                  child: Row(children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: FinStackColors.brandYellow,
                        border: Border.all(color: FinStackColors.onSurface, width: 3),
                        boxShadow: const [
                          BoxShadow(
                            color: FinStackColors.onSurface,
                            offset: Offset(3, 3),
                            blurRadius: 0,
                          )
                        ],
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        initials,
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text(
                          'FINSTACK',
                          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                        ),
                        Text(
                          name,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        BrutalTag(label: role, color: FinStackColors.surfaceContainer),
                      ]),
                    ),
                  ]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 2),
                child: GestureDetector(
                  onTap: _openScanFromDrawer,
                  child: Container(
                    padding: const EdgeInsets.all(11),
                    decoration: BoxDecoration(
                      color: FinStackColors.brandYellow,
                      border: Border.all(color: FinStackColors.onSurface, width: 3),
                      boxShadow: const [
                        BoxShadow(
                          color: FinStackColors.onSurface,
                          offset: Offset(3, 3),
                          blurRadius: 0,
                        )
                      ],
                    ),
                    child: Row(children: [
                      const Icon(Icons.qr_code_scanner, size: 24),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('SCAN & PAY',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13)),
                          Text('Pay UPI · log it automatically',
                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600)),
                        ]),
                      ),
                      const BrutalTag(label: 'New', color: Colors.white),
                    ]),
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(14, 8, 14, 4),
                child: Text(
                  'WORKSPACE',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.4,
                    color: FinStackColors.onSurfaceVariant,
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: _dests.length,
                  padding: const EdgeInsets.only(bottom: 8),
                  itemBuilder: (c, i) {
                    final d = _dests[i];
                    final active = i == idx;
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(8, 2, 8, 2),
                      child: GestureDetector(
                        onTap: () => _go(i),
                        child: Container(
                          decoration: BoxDecoration(
                            color: active ? FinStackColors.brandYellow : Colors.transparent,
                            border: Border(
                              left: BorderSide(
                                color: active
                                    ? FinStackColors.onSurface
                                    : Colors.transparent,
                                width: 4,
                              ),
                              bottom: BorderSide(
                                color: active
                                    ? FinStackColors.onSurface
                                    : FinStackColors.onSurface.withValues(alpha: 0.10),
                                width: active ? 2 : 1,
                              ),
                            ),
                            boxShadow: active
                                ? const [
                                    BoxShadow(
                                      color: FinStackColors.onSurface,
                                      offset: Offset(2, 2),
                                      blurRadius: 0,
                                    )
                                  ]
                                : const [],
                          ),
                          child: ListTile(
                            dense: true,
                            visualDensity: VisualDensity.compact,
                            leading: Icon(
                              d.icon,
                              size: 20,
                              color: active
                                  ? FinStackColors.onSurface
                                  : FinStackColors.onSurfaceVariant,
                            ),
                            title: Text(
                              d.label,
                              style: TextStyle(
                                fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                                fontSize: 14,
                                color: active
                                    ? FinStackColors.onSurface
                                    : FinStackColors.onSurfaceVariant,
                              ),
                            ),
                            trailing: active
                                ? const Icon(Icons.arrow_forward, size: 16)
                                : null,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: FinStackColors.onSurface, width: 3),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('FinStack v1.0.0', style: TextStyle(fontSize: 9)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: FinStackColors.brandYellow,
                        border: Border.all(color: FinStackColors.onSurface, width: 1.5),
                      ),
                      child: const Text(
                        'LIVE',
                        style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      body: BrutalGrid(
        child: IndexedStack(
          index: idx,
          children: [
            for (var i = 0; i < _dests.length; i++)
              visited.contains(i) ? _dests[i].page() : const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }
}
