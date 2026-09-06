import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../widgets/brutal.dart';

/// App settings: server URL editor (ApiClient.baseUrl + setBaseUrl),
/// logout via the same authProvider pattern as profile_page.dart, version text.
class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});
  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  late final TextEditingController serverCtrl;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    serverCtrl = TextEditingController(text: ApiClient.baseUrl);
  }

  @override
  void dispose() {
    serverCtrl.dispose();
    super.dispose();
  }

  Future<void> saveUrl() async {
    if (serverCtrl.text.trim().isEmpty) return;
    setState(() => saving = true);
    try {
      await ApiClient.setBaseUrl(serverCtrl.text);
      if (!mounted) return;
      setState(() => serverCtrl.text = ApiClient.baseUrl);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Server: ${ApiClient.baseUrl}')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('SETTINGS\nServer, session and app info.', style: TextStyle(fontSize: 12)),
        const SizedBox(height: 12),
        BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('SERVER', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(ApiClient.baseUrl, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          BrutalField(label: 'Server URL', controller: serverCtrl, hint: 'http://<Mac-IP>:3000/api'),
          const SizedBox(height: 8),
          Align(alignment: Alignment.centerRight, child: BrutalButton(
            label: saving ? 'Saving…' : 'Save URL',
            onPressed: saving ? null : saveUrl,
          )),
        ])),
        const SizedBox(height: 12),
        BrutalButton(
          label: 'Logout',
          icon: Icons.logout,
          onPressed: () => ref.read(authProvider.notifier).logout(),
        ),
        const SizedBox(height: 12),
        const BrutalCard(
          child: Center(child: Text('FinStack v1.0.0',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700))),
        ),
      ]),
    );
  }
}
