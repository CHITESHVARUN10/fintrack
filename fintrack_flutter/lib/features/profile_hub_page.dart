import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/auth_state.dart';
import '../core/bank_import.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import 'budgets_page.dart';
import 'family_dashboard_page.dart';
import 'import_page.dart';
import 'income_page.dart';
import 'investments_page.dart';
import 'notifications_page.dart';
import 'profile_page.dart';
import 'recurring_page.dart';
import 'reports_page.dart';
import 'settings_page.dart';
import 'subscriptions_page.dart';
import 'tax_page.dart';
import 'vendors_page.dart';

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

class _WorkspaceEntry {
  final String label;
  final IconData icon;
  final Color color;
  final String title;
  final WidgetBuilder builder;
  const _WorkspaceEntry(
    this.label,
    this.icon,
    this.color,
    this.title,
    this.builder,
  );
}

List<_WorkspaceEntry> _workspace(BankImport bankImport) => <_WorkspaceEntry>[
  _WorkspaceEntry(
    'Family board',
    Icons.analytics,
    FinStackColors.tertiary,
    'FAMILY DASHBOARD',
    (_) => FamilyDashboardPage(),
  ),
  _WorkspaceEntry(
    'Income',
    Icons.wallet,
    FinStackColors.accentGreen,
    'INCOME',
    (_) => IncomePage(),
  ),
  _WorkspaceEntry(
    'Import',
    Icons.upload_file,
    FinStackColors.accentOrange,
    'IMPORT',
    (_) => ImportPageWidget(bankImport: bankImport),
  ),
  _WorkspaceEntry(
    'Budgets',
    Icons.savings,
    FinStackColors.brandYellow,
    'BUDGETS',
    (_) => BudgetsPage(),
  ),
  _WorkspaceEntry(
    'Vendors',
    Icons.store,
    FinStackColors.accentPink,
    'VENDORS',
    (_) => VendorsPage(),
  ),
  _WorkspaceEntry(
    'Subscriptions',
    Icons.autorenew,
    FinStackColors.accentPurple,
    'SUBSCRIPTIONS',
    (_) => SubscriptionsPage(),
  ),
  _WorkspaceEntry(
    'Recurring',
    Icons.event_repeat,
    FinStackColors.accentCyan,
    'RECURRING',
    (_) => RecurringPage(),
  ),
  _WorkspaceEntry(
    'Investments',
    Icons.trending_up,
    FinStackColors.accentGreen,
    'INVESTMENTS',
    (_) => InvestmentsPage(),
  ),
  _WorkspaceEntry(
    'Tax',
    Icons.calculate,
    FinStackColors.accentOrange,
    'TAX',
    (_) => TaxPage(),
  ),
  _WorkspaceEntry(
    'Reports',
    Icons.bar_chart,
    FinStackColors.accentBlue,
    'REPORTS',
    (_) => ReportsPage(),
  ),
];

/// The account tab: identity at the top, then the two things people reach for
/// daily (notifications, settings), then everything else folded into one
/// workspace grid. This is what keeps the bottom bar to five destinations.
class ProfileHubPage extends ConsumerWidget {
  const ProfileHubPage({super.key, required this.bankImport});

  final BankImport bankImport;

  void _push(BuildContext context, String title, Widget page) {
    dismissKeyboard(context);
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (routeContext) => Scaffold(
          appBar: AppBar(
            title: Text(title),
            leadingWidth: 56,
            leading: Padding(
              padding: const EdgeInsets.only(left: 12),
              child: BrutalIconButton(
                icon: Icons.arrow_back,
                tooltip: 'Back',
                color: Colors.white,
                onPressed: () => Navigator.of(routeContext).pop(),
              ),
            ),
          ),
          body: BrutalGrid(child: page),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user ?? {};
    final name = '${user['name'] ?? ''}';
    final email = '${user['email'] ?? ''}';
    final role = '${user['role'] ?? 'member'}';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        BrutalCard(
          color: FinStackColors.brandYellow,
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: FinStackColors.onSurface, width: 3),
                  boxShadow: const [
                    BoxShadow(
                      color: FinStackColors.onSurface,
                      offset: Offset(3, 3),
                      blurRadius: 0,
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Text(
                  _initials(name),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? 'FinStack member' : name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (email.isNotEmpty)
                      Text(
                        email,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        BrutalTag(label: role, color: Colors.white),
                        const SizedBox(width: 6),
                        const BrutalTag(
                          label: 'FinStack',
                          color: FinStackColors.tertiary,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _HubRow(
          icon: Icons.notifications,
          label: 'Notifications',
          subtitle: 'Alerts, reminders and family activity',
          color: FinStackColors.accentOrange,
          onTap: () =>
              _push(context, 'NOTIFICATIONS', const NotificationsPage()),
        ),
        const SizedBox(height: 8),
        _HubRow(
          icon: Icons.settings,
          label: 'Settings',
          subtitle: 'Server, session and app info',
          color: FinStackColors.surfaceHigh,
          onTap: () => _push(context, 'SETTINGS', const SettingsPage()),
        ),
        const SizedBox(height: 8),
        _HubRow(
          icon: Icons.family_restroom,
          label: 'Family setup',
          subtitle: 'Create or join a family, invites and preferences',
          color: FinStackColors.tertiary,
          onTap: () => _push(context, 'FAMILY', const ProfilePage()),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Container(width: 8, height: 16, color: FinStackColors.brandYellow),
            const SizedBox(width: 8),
            const Text(
              'WORKSPACE',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.35,
          children: [
            for (final entry in _workspace(bankImport))
              _WorkspaceTile(
                entry: entry,
                onTap: () =>
                    _push(context, entry.title, entry.builder(context)),
              ),
          ],
        ),
        const SizedBox(height: 18),
        BrutalButton(
          block: true,
          color: Colors.white,
          label: 'Log out',
          icon: Icons.logout,
          onPressed: () => ref.read(authProvider.notifier).logout(),
        ),
        const SizedBox(height: 10),
        const Center(
          child: Text(
            'FinStack v1.0.0 · LIVE',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

class _HubRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;
  const _HubRow({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: brutal(border: 2, shadow: 3),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: color,
                border: Border.all(color: FinStackColors.onSurface, width: 2),
              ),
              child: Icon(icon, size: 19),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      color: FinStackColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 20),
          ],
        ),
      ),
    );
  }
}

class _WorkspaceTile extends StatelessWidget {
  final _WorkspaceEntry entry;
  final VoidCallback onTap;
  const _WorkspaceTile({required this.entry, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: brutal(border: 2, shadow: 3),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: entry.color,
                border: Border.all(color: FinStackColors.onSurface, width: 2),
              ),
              child: Icon(entry.icon, size: 17),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                entry.label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
