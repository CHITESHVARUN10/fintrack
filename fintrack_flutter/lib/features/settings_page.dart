import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../theme/finstack_theme.dart';
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
    if (saving || serverCtrl.text.trim().isEmpty) return;
    dismissKeyboard(context);
    setState(() => saving = true);
    try {
      await ApiClient.setBaseUrl(serverCtrl.text);
      if (!mounted) return;
      setState(() => serverCtrl.text = ApiClient.baseUrl);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Server: ${ApiClient.baseUrl}')));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not save the server URL. Try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
    children: [
      Text(
        'Server, session and app info.',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      const SizedBox(height: 13),
      BrutalCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 9,
          children: [
            const Text('SERVER', style: FinStackType.caption),
            SelectableText(
              ApiClient.baseUrl,
              style: FinStackType.caption.copyWith(
                fontSize: 12,
                color: FinStackColors.onSurface,
              ),
            ),
            BrutalField(
              label: 'Server URL',
              controller: serverCtrl,
              hint: 'http://<Mac-IP>:3000/api',
              keyboardType: TextInputType.url,
              autocorrect: false,
              enableSuggestions: false,
            ),
            Align(
              alignment: Alignment.centerRight,
              child: BrutalButton(
                label: saving ? 'Saving…' : 'Save URL',
                onPressed: saving ? null : saveUrl,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 13),
      BrutalButton(
        label: 'Logout',
        block: true,
        icon: Icons.logout,
        onPressed: () => ref.read(authProvider.notifier).logout(),
      ),
      const SizedBox(height: 13),
      const BrutalCard(
        child: Center(
          child: Text(
            'FinStack v1.1.0',
            style: TextStyle(
              fontFamily: FinStackType.mono,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    ],
  );
}
