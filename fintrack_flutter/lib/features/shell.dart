import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/bank_import.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import 'dashboard_page.dart';
import 'family_page.dart';
import 'profile_hub_page.dart';
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
    BrutalNavItem('Activity', Icons.receipt_long_outlined),
    BrutalNavItem('Scan', Icons.qr_code_scanner),
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
      }
      _tab = next;
      _visited.add(next);
    });
  }

  Widget _pageFor(_Tab tab) {
    switch (tab) {
      case _Tab.home:
        return const DashboardPage();
      case _Tab.activity:
        return TransactionsPage(refresh: _activityRefresh);
      case _Tab.statistics:
        return StatisticsPage(refresh: _statisticsRefresh);
      case _Tab.family:
        return const FamilyPage();
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

  PreferredSizeWidget _tabHeader(_Tab tab) => AppBar(
    title: Row(
      children: [
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
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            (tab == _Tab.statistics ? 'Statistics' : _items[tab.index].label)
                .toUpperCase(),
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _tab == _Tab.profile ? null : _tabHeader(_tab),
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
