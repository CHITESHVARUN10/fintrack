import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/bank_import.dart';
import '../core/auth_state.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/workspace.dart';
import 'dashboard_page.dart';
import 'family_page.dart';
import 'income_page.dart';
import 'investments_page.dart';
import 'profile_hub_page.dart';
import 'profile_page.dart';
import 'scan_pay_page.dart';
import 'statistics_page.dart';
import 'transactions_page.dart';

enum _Tab { home, activity, scan, statistics, family, profile }

class Shell extends ConsumerStatefulWidget {
  const Shell({super.key});
  @override
  ConsumerState<Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<Shell> {
  _Tab _tab = _Tab.home;
  int _activityRefresh = 0;
  int _statisticsRefresh = 0;
  int _familyRefresh = 0;
  final _visited = {_Tab.home};
  final _profileNavigator = GlobalKey<NavigatorState>();
  late final _bankImport = BankImport(
    onLedgerChanged: (message) {
      if (!mounted) return;
      setState(() {
        _activityRefresh++;
        _statisticsRefresh++;
      });
      if (_tab != _Tab.profile ||
          _profileNavigator.currentState?.canPop() == false) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    },
  );

  @override
  void dispose() {
    _bankImport.dispose();
    super.dispose();
  }

  static const _items = [
    BrutalNavItem('Home', Icons.home_outlined),
    BrutalNavItem('Activity', Icons.receipt_outlined),
    BrutalNavItem('Scan', Icons.qr_code_2),
    BrutalNavItem('Stats', Icons.bar_chart_outlined),
    BrutalNavItem('Family', Icons.group_outlined),
    BrutalNavItem('Profile', Icons.person_outline),
  ];

  Future<void> _openScan() async {
    dismissKeyboard(context);
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ScanPayPage()));
    if (!mounted) return;
    setState(() {
      if (_tab == _Tab.activity) _activityRefresh++;
      if (_tab == _Tab.statistics) _statisticsRefresh++;
    });
  }

  void _onTab(int index) {
    final next = _Tab.values[index];
    if (next == _Tab.scan) {
      _openScan();
      return;
    }
    dismissKeyboard(context);
    if (next == _Tab.profile && _tab == next) {
      _profileNavigator.currentState?.popUntil((route) => route.isFirst);
      return;
    }
    setState(() {
      if (_tab != next && _visited.contains(next)) {
        if (next == _Tab.activity) _activityRefresh++;
        if (next == _Tab.statistics) _statisticsRefresh++;
        if (next == _Tab.family) _familyRefresh++;
      }
      _tab = next;
      _visited.add(next);
    });
  }

  Widget _pageFor(_Tab tab) {
    switch (tab) {
      case _Tab.home:
        return DashboardPage(
          onIncome: () => _openWorkspace(const IncomePage()),
          onActivity: () => _onTab(_Tab.activity.index),
          onInvestments: () => _openWorkspace(const InvestmentsPage()),
        );
      case _Tab.activity:
        return TransactionsPage(refresh: _activityRefresh, showHeader: true);
      case _Tab.statistics:
        return StatisticsPage(refresh: _statisticsRefresh);
      case _Tab.family:
        final user = ref.watch(authProvider).user;
        return FamilyPage(
          showHeader: true,
          refresh: _familyRefresh,
          userId: (user?['_id'] ?? user?['id'])?.toString(),
          onSetup: () => _openWorkspace(
            const WorkspaceScaffold(title: 'Family setup', body: ProfilePage()),
          ),
        );
      case _Tab.profile:
        return NavigatorPopHandler<Object?>(
          enabled: _tab == _Tab.profile,
          onPopWithResult: (result) {
            if (_tab == _Tab.profile) {
              _profileNavigator.currentState?.maybePop(result);
            }
          },
          child: Navigator(
            key: _profileNavigator,
            onGenerateRoute: (_) => MaterialPageRoute<void>(
              builder: (_) => Scaffold(
                appBar: _tabHeader(_Tab.profile),
                body: BrutalGrid(
                  child: ProfileHubPage(bankImport: _bankImport),
                ),
              ),
            ),
          ),
        );
      case _Tab.scan:
        return const SizedBox.shrink();
    }
  }

  void _openWorkspace(Widget page) {
    _onTab(_Tab.profile.index);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _tab == _Tab.profile) {
        _profileNavigator.currentState?.push(
          MaterialPageRoute<void>(builder: (_) => page),
        );
      }
    });
  }

  PreferredSizeWidget _tabHeader(_Tab tab) => AppBar(
    title: FinStackTitle(
      tab == _Tab.statistics ? 'Statistics' : _items[tab.index].label,
    ),
    actions: [
      if (tab == _Tab.home)
        const Padding(
          padding: EdgeInsets.only(right: 14),
          child: BrutalTag(
            label: 'Individual',
            color: FinStackColors.surfaceContainer,
          ),
        ),
      if (tab == _Tab.statistics)
        Padding(
          padding: const EdgeInsets.only(right: 14),
          child: BrutalTag(
            label: monthYearLabel(DateTime.now()),
            color: FinStackColors.surfaceContainer,
          ),
        ),
      if (tab == _Tab.profile)
        const Padding(
          padding: EdgeInsets.only(right: 14),
          child: BrutalTag(
            label: 'Live',
            color: FinStackColors.surfaceContainer,
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar:
          _tab == _Tab.profile || _tab == _Tab.activity || _tab == _Tab.family
          ? null
          : _tabHeader(_tab),
      body: BrutalGrid(
        child: IndexedStack(
          index: _tab.index,
          children: [
            for (final tab in _Tab.values)
              _visited.contains(tab) ? _pageFor(tab) : const SizedBox.shrink(),
          ],
        ),
      ),
      bottomNavigationBar: BrutalBottomNav(
        index: _tab.index,
        items: _items,
        actionIndex: _Tab.scan.index,
        onTap: _onTab,
      ),
    );
  }
}
