import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/auth_state.dart';
import '../core/bank_import.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/workspace.dart';
import 'budgets_page.dart';
import 'family_dashboard_page.dart';
import 'family_sharing_page.dart';
import 'import_page.dart';
import 'income_page.dart';
import 'investments_page.dart';
import 'notifications_page.dart';
import 'profile_page.dart';
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
  final WidgetBuilder builder;
  const _WorkspaceEntry(this.label, this.icon, this.color, this.builder);
}

List<_WorkspaceEntry> _workspace(BankImport bankImport) => <_WorkspaceEntry>[
  _WorkspaceEntry(
    'Family board',
    Icons.analytics,
    FinStackColors.tertiary,
    (_) => const WorkspaceScaffold(
      title: 'Family dashboard',
      body: FamilyDashboardPage(),
    ),
  ),
  _WorkspaceEntry(
    'Income',
    Icons.wallet,
    FinStackColors.accentGreen,
    (_) => IncomePage(),
  ),
  _WorkspaceEntry(
    'Import',
    Icons.upload_file,
    FinStackColors.accentOrange,
    (_) => ImportPageWidget(bankImport: bankImport),
  ),
  _WorkspaceEntry(
    'Budgets',
    Icons.savings,
    FinStackColors.brandYellow,
    (_) => BudgetsPage(),
  ),
  _WorkspaceEntry(
    'Vendors',
    Icons.store,
    FinStackColors.accentPink,
    (_) => VendorsPage(),
  ),
  _WorkspaceEntry(
    'Subscriptions',
    Icons.autorenew,
    FinStackColors.accentPurple,
    (_) => SubscriptionsPage(),
  ),
  _WorkspaceEntry(
    'Investments',
    Icons.trending_up,
    FinStackColors.accentGreen,
    (_) => InvestmentsPage(),
  ),
  _WorkspaceEntry(
    'Tax',
    Icons.calculate,
    FinStackColors.accentOrange,
    (_) => TaxPage(),
  ),
  _WorkspaceEntry(
    'Reports',
    Icons.bar_chart,
    FinStackColors.accentBlue,
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
      MaterialPageRoute<void>(
        builder: (_) => WorkspaceScaffold(title: title, body: page),
      ),
    );
  }

  void _openTool(BuildContext context, _WorkspaceEntry entry) {
    dismissKeyboard(context);
    Navigator.of(context).push(MaterialPageRoute<void>(builder: entry.builder));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user ?? {};
    final name = '${user['name'] ?? ''}';
    final email = '${user['email'] ?? ''}';
    final role = '${user['role'] ?? 'member'}';

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 19, 28),
      children: [
        BrutalCard(
          color: FinStackColors.brandYellow,
          child: Row(
            children: [
              Container(
                width: 50,
                height: 50,
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
                        fontFamily: FinStackType.display,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (email.isNotEmpty)
                      Text(
                        email,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: FinStackType.mono,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
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
          icon: Icons.lock_outline,
          label: 'Privacy & sharing',
          subtitle: 'Choose which months your family can see',
          color: FinStackColors.accentPurple,
          onTap: () => _push(
            context,
            'PRIVACY & SHARING',
            const FamilySharingPage(),
          ),
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
        const BrutalSectionTitle(title: 'Workspace'),
        const SizedBox(height: 10),
        GridView(
          shrinkWrap: true,
          clipBehavior: Clip.none,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            mainAxisExtent:
                (MediaQuery.textScalerOf(context).scale(13) * 2.3 + 24).clamp(
                  63.0,
                  135.0,
                ),
          ),
          children: [
            for (final entry in _workspace(bankImport))
              _WorkspaceTile(
                entry: entry,
                onTap: () => _openTool(context, entry),
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
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
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
                      fontFamily: FinStackType.display,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11.5,
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
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: brutal(border: 2, shadow: 3),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
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
                  fontFamily: FinStackType.display,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
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
