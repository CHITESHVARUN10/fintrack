import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import 'dashboard_page.dart';
import 'family_page.dart';
import 'profile_hub_page.dart';
import 'scan_pay_page.dart';
import 'transactions_page.dart';

/// Five destinations, the same shape iOS users expect from WhatsApp or
/// Instagram: Home, Activity, a raised Scan action, Family and Profile.
/// Everything else lives inside Profile → Workspace.
class Shell extends ConsumerStatefulWidget {
  const Shell({super.key});
  @override
  ConsumerState<Shell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<Shell> {
  int idx = 0;
  final Set<int> visited = {0};

  static const _items = [
    BrutalNavItem('Home', Icons.home_outlined),
    BrutalNavItem('Activity', Icons.receipt_long_outlined),
    BrutalNavItem('Scan', Icons.qr_code_scanner),
    BrutalNavItem('Family', Icons.group_outlined),
    BrutalNavItem('Profile', Icons.person_outline),
  ];

  void _openScan() {
    dismissKeyboard(context);
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ScanPayPage()));
  }

  void _onTab(int i) {
    if (i == 2) {
      _openScan();
      return;
    }
    dismissKeyboard(context);
    setState(() {
      idx = i;
      visited.add(i);
    });
  }

  Widget _pageFor(int i) {
    switch (i) {
      case 0:
        return const DashboardPage();
      case 1:
        return const TransactionsPage();
      case 3:
        return const FamilyPage();
      case 4:
        return const ProfileHubPage();
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
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
                _items[idx].label.toUpperCase(),
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
            ),
          ],
        ),
      ),
      body: BrutalGrid(
        child: IndexedStack(
          index: idx,
          children: [
            for (var i = 0; i < _items.length; i++)
              visited.contains(i) ? _pageFor(i) : const SizedBox.shrink(),
          ],
        ),
      ),
      bottomNavigationBar: BrutalBottomNav(
        index: idx,
        items: _items,
        actionIndex: 2,
        onTap: _onTab,
      ),
    );
  }
}
