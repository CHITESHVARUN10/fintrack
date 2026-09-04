import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../widgets/brutal.dart';

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/// Mirrors website Settings.tsx Account section: avatar, name/email,
/// role badge, family, server URL, logout. Same /auth/me + /auth/logout.
class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});
  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  Map? family;
  List members = [];
  final serverCtrl = TextEditingController();
  bool push = true, emailSum = true, reminders = true;

  @override
  void initState() {
    super.initState();
    serverCtrl.text = ApiClient.baseUrl;
    load();
  }

  Future<void> load() async {
    try {
      final me = await ApiClient.dio.get('/families/me');
      if (!mounted) return;
      setState(() => family = me.data['family']);
      final fid = me.data['family']?['_id'];
      if (fid != null) {
        final m = await ApiClient.dio.get('/families/$fid/members');
        if (!mounted) return;
        setState(() => members = (m.data['members'] as List?) ?? []);
      }
    } catch (_) {}
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
            width: 64, height: 64,
            decoration: BoxDecoration(color: const Color(0xFFFFE500), border: Border.all(width: 3)),
            alignment: Alignment.center,
            child: Text(_initials(name), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name.isEmpty ? '—' : name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text(email, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(border: Border.all(width: 2)),
              child: Text(role.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
            ),
          ])),
        ]),
      ),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('FAMILY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(family?['name'] ?? 'No family yet — create or join below.', style: const TextStyle(fontWeight: FontWeight.w700)),
        if (family?['inviteCode'] != null) Text('Invite code: ${family!['inviteCode']}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 2)),
        if (members.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...members.map((m) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(children: [
              Expanded(child: Text('${m['name'] ?? m['email'] ?? ''}', style: const TextStyle(fontSize: 12))),
              Text('${m['role'] ?? ''}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
            ]),
          )),
        ],
      ])),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('NOTIFICATIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        SwitchListTile(title: const Text('Push Notifications', style: TextStyle(fontSize: 12)), value: push, onChanged: (v) => setState(() => push = v)),
        SwitchListTile(title: const Text('Email Summaries', style: TextStyle(fontSize: 12)), value: emailSum, onChanged: (v) => setState(() => emailSum = v)),
        SwitchListTile(title: const Text('Payment Reminders (3 days before)', style: TextStyle(fontSize: 12)), value: reminders, onChanged: (v) => setState(() => reminders = v)),
      ])),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('SERVER', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        TextField(controller: serverCtrl, decoration: const InputDecoration(hintText: 'http://<Mac-IP>:3000/api')),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: BrutalButton(label: 'Save URL', onPressed: () async {
          await ApiClient.setBaseUrl(serverCtrl.text);
          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Server: ${ApiClient.baseUrl} — please log in again')));
          await ref.read(authProvider.notifier).logout();
        })),
      ])),
      const SizedBox(height: 12),
      BrutalButton(
        label: 'Logout',
        icon: Icons.logout,
        onPressed: () => ref.read(authProvider.notifier).logout(),
      ),
    ]);
  }
}
