import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/// Mirrors website Profile/Settings: account, family setup, members,
/// notifications, server URL and logout. Family creation/joining lives here
/// (moved out of the Members screen) so the app matches the website.
class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});
  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  Map? family;
  List members = [];
  bool familyLoading = true;
  String? familyError;
  bool busy = false;

  final serverCtrl = TextEditingController();
  final nameCtrl = TextEditingController();
  final codeCtrl = TextEditingController();
  bool push = true, emailSum = true, reminders = true;

  @override
  void initState() {
    super.initState();
    serverCtrl.text = ApiClient.baseUrl;
    load();
  }

  @override
  void dispose() {
    serverCtrl.dispose();
    nameCtrl.dispose();
    codeCtrl.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      familyLoading = true;
      familyError = null;
    });
    try {
      final me = await ApiClient.dio.get('/families/me');
      if (!mounted) return;
      final fam = me.data['family'];
      setState(() => family = fam);
      final fid = fam?['_id'];
      if (fid != null) {
        final m = await ApiClient.dio.get('/families/$fid/members');
        if (!mounted) return;
        setState(() => members = (m.data['members'] as List?) ?? []);
      } else {
        setState(() => members = []);
      }
    } catch (_) {
      if (mounted) {
        setState(() => familyError = 'Could not load your family. Check your connection and retry.');
      }
    } finally {
      if (mounted) setState(() => familyLoading = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _createFamily() async {
    final name = nameCtrl.text.trim();
    if (name.isEmpty) {
      _snack('Enter a family name');
      return;
    }
    setState(() => busy = true);
    try {
      await ApiClient.dio.post('/families', data: {'name': name});
      nameCtrl.clear();
      await ref.read(authProvider.notifier).checkSession();
      await load();
      _snack('Family created — you are the admin.');
    } catch (_) {
      _snack('Could not create the family. Check your connection.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _joinFamily() async {
    final code = codeCtrl.text.trim();
    if (code.isEmpty) {
      _snack('Enter an invite code');
      return;
    }
    setState(() => busy = true);
    try {
      await ApiClient.dio.post('/families/join', data: {'inviteCode': code.toUpperCase()});
      codeCtrl.clear();
      await ref.read(authProvider.notifier).checkSession();
      await load();
      _snack('Join request sent — an admin has to approve it.');
    } catch (_) {
      _snack('Could not join. Check the invite code and your connection.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _familySection() {
    if (familyLoading) {
      return const BrutalCard(
        child: Row(children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 3, color: FinStackColors.onSurface),
          ),
          SizedBox(width: 10),
          Text('Loading family…', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      );
    }
    if (familyError != null) {
      return BrutalCard(
        color: FinStackColors.errorContainer,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(familyError!,
              style: const TextStyle(
                  color: FinStackColors.onErrorContainer, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          BrutalButton(label: 'Retry', icon: Icons.refresh, onPressed: load),
        ]),
      );
    }
    if (family != null) {
      return BrutalCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('FAMILY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(family!['name'] ?? 'Family',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          if (family!['inviteCode'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Invite code: ${family!['inviteCode']}',
                  style: const TextStyle(
                      fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 2)),
            ),
          if (members.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('MEMBERS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
            ...members.map((m) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(children: [
                    Expanded(
                      child: Text('${m['name'] ?? m['email'] ?? ''}',
                          style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis),
                    ),
                    Text('${m['role'] ?? ''}',
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
                  ]),
                )),
          ],
          const SizedBox(height: 6),
          const Text('Approve join requests from the Members screen.',
              style: TextStyle(fontSize: 11)),
        ]),
      );
    }
    return BrutalCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('SET UP YOUR FAMILY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text(
          'Create a household as admin, or join one with an invite code. A family is required for Import, Transactions and Budgets.',
          style: TextStyle(fontSize: 12),
        ),
        const SizedBox(height: 12),
        TextField(controller: nameCtrl, decoration: const InputDecoration(hintText: 'Family name (e.g. Sharma Family)')),
        const SizedBox(height: 8),
        BrutalButton(label: busy ? 'Creating…' : 'Create Family', icon: Icons.group_add, onPressed: busy ? null : _createFamily),
        const SizedBox(height: 12),
        TextField(
          controller: codeCtrl,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'Invite code (e.g. VF7K92)'),
        ),
        const SizedBox(height: 8),
        BrutalButton(label: busy ? 'Joining…' : 'Join Family', icon: Icons.login, onPressed: busy ? null : _joinFamily),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user ?? {};
    final name = (user['name'] ?? '') as String;
    final email = (user['email'] ?? '') as String;
    final role = (user['role'] ?? 'member') as String;

    return ListView(padding: const EdgeInsets.all(16), children: [
      BrutalCard(
        child: Row(children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
                color: FinStackColors.brandYellow,
                border: Border.all(width: 3, color: FinStackColors.onSurface)),
            alignment: Alignment.center,
            child: Text(_initials(name), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name.isEmpty ? '—' : name,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  overflow: TextOverflow.ellipsis),
              Text(email, style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(border: Border.all(width: 2, color: FinStackColors.onSurface)),
                child: Text(role.toUpperCase(),
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
              ),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      _familySection(),
      const SizedBox(height: 12),
      BrutalCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('NOTIFICATIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          SwitchListTile(
              title: const Text('Push Notifications', style: TextStyle(fontSize: 12)),
              value: push,
              onChanged: (v) => setState(() => push = v)),
          SwitchListTile(
              title: const Text('Email Summaries', style: TextStyle(fontSize: 12)),
              value: emailSum,
              onChanged: (v) => setState(() => emailSum = v)),
          SwitchListTile(
              title: const Text('Payment Reminders (3 days before)', style: TextStyle(fontSize: 12)),
              value: reminders,
              onChanged: (v) => setState(() => reminders = v)),
        ]),
      ),
      const SizedBox(height: 12),
      BrutalCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('SERVER', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          TextField(
              controller: serverCtrl,
              decoration: const InputDecoration(hintText: 'http://<Mac-IP>:3000/api')),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: BrutalButton(
                label: 'Save URL',
                onPressed: () async {
                  await ApiClient.setBaseUrl(serverCtrl.text);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Server: ${ApiClient.baseUrl} — please log in again')));
                  await ref.read(authProvider.notifier).logout();
                }),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      BrutalButton(
        label: 'Logout',
        icon: Icons.logout,
        onPressed: () => ref.read(authProvider.notifier).logout(),
      ),
    ]);
  }
}
