import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/finstack_theme.dart';
import '../core/auth_state.dart';
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
import 'loans_page.dart';
import 'insurance_page.dart';
import 'education_page.dart';
import 'tax_page.dart';
import 'form16_page.dart';
import 'reports_page.dart';
import 'notifications_page.dart';
import 'settings_page.dart';

class _Dest {
  final String label;
  final IconData icon;
  final Widget page;
  const _Dest(this.label, this.icon, this.page);
}

const _dests = [
  _Dest('Overview', Icons.home, DashboardPage()),
  _Dest('Transactions', Icons.receipt_long, TransactionsPage()),
  _Dest('Income', Icons.wallet, IncomePage()),
  _Dest('Family Dashboard', Icons.analytics, FamilyDashboardPage()),
  _Dest('Members', Icons.group, FamilyPage()),
  _Dest('Import', Icons.upload_file, ImportPageWidget()),
  _Dest('Budgets', Icons.savings, BudgetsPage()),
  _Dest('Vendors', Icons.store, VendorsPage()),
  _Dest('Subscriptions', Icons.autorenew, SubscriptionsPage()),
  _Dest('Recurring', Icons.event_repeat, RecurringPage()),
  _Dest('Investments', Icons.trending_up, InvestmentsPage()),
  _Dest('Loans', Icons.account_balance, LoansPage()),
  _Dest('Insurance', Icons.health_and_safety, InsurancePage()),
  _Dest('Education', Icons.school, EducationPage()),
  _Dest('Tax', Icons.calculate, TaxPage()),
  _Dest('Form 16', Icons.description, Form16Page()),
  _Dest('Reports', Icons.bar_chart, ReportsPage()),
  _Dest('Notifications', Icons.notifications, NotificationsPage()),
  _Dest('Profile', Icons.person, ProfilePage()),
  _Dest('Settings', Icons.settings, SettingsPage()),
];

/// Real mobile-app navigation: hamburger (☰) opens a retractable drawer
/// listing every screen, instead of a congested 8-item bottom bar.
class Shell extends ConsumerStatefulWidget {
  const Shell({super.key});
  @override
  ConsumerState<Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<Shell> {
  int idx = 0;

  void _go(int i) {
    setState(() => idx = i);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final name = '${user?['name'] ?? 'FinStack'}';
    final initials = name.trim().isEmpty
        ? '?'
        : name.trim().split(RegExp(r'\s+')).map((p) => p[0]).take(2).join().toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text(_dests[idx].label.toUpperCase(),
            style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
        centerTitle: false,
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
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: FinStackColors.onSurface, width: 3)),
                ),
                child: Row(children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: FinStackColors.brandYellow,
                      border: Border.all(color: FinStackColors.onSurface, width: 3),
                    ),
                    alignment: Alignment.center,
                    child: Text(initials, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('FINSTACK', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                      Text(name, style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis),
                    ]),
                  ),
                ]),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: _dests.length,
                  itemBuilder: (c, i) {
                    final d = _dests[i];
                    final active = i == idx;
                    return Container(
                      margin: const EdgeInsets.fromLTRB(8, 6, 8, 0),
                      decoration: BoxDecoration(
                        color: active ? FinStackColors.brandYellow : Colors.transparent,
                        border: Border.all(
                          color: FinStackColors.onSurface,
                          width: active ? 3 : 1.5,
                        ),
                      ),
                      child: ListTile(
                        dense: true,
                        leading: Icon(d.icon, color: FinStackColors.onSurface),
                        title: Text(d.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        selected: active,
                        onTap: () => _go(i),
                      ),
                    );
                  },
                ),
              ),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: FinStackColors.onSurface, width: 3)),
                ),
                child: const Text('FinStack v1.0.0', style: TextStyle(fontSize: 10)),
              ),
            ],
          ),
        ),
      ),
      body: IndexedStack(index: idx, children: _dests.map((d) => d.page).toList()),
    );
  }
}
