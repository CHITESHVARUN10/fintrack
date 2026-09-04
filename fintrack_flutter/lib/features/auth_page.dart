import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../widgets/brutal.dart';

/// Mirrors website Login.tsx + Register: same endpoints, same validation,
/// same auto-login-after-register behaviour.
class AuthPage extends ConsumerStatefulWidget {
  const AuthPage({super.key});
  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  bool isLogin = true;
  final nameCtrl = TextEditingController();
  final emailCtrl = TextEditingController();
  final passCtrl = TextEditingController();
  final serverCtrl = TextEditingController();
  bool busy = false;
  String? error;
  bool showServer = false;

  @override
  void initState() {
    super.initState();
    serverCtrl.text = ApiClient.baseUrl;
  }

  Future<void> submit() async {
    final email = emailCtrl.text.trim();
    final pass = passCtrl.text;
    if (!email.contains('@') || pass.isEmpty) {
      setState(() => error = 'Enter a valid email and password.');
      return;
    }
    if (!isLogin && nameCtrl.text.trim().isEmpty) {
      setState(() => error = 'Enter your name.');
      return;
    }
    if (pass.length < 6 && !isLogin) {
      setState(() => error = 'Password must be at least 6 characters.');
      return;
    }
    setState(() { busy = true; error = null; });
    try {
      final auth = ref.read(authProvider.notifier);
      if (isLogin) {
        await auth.login(email, pass);
      } else {
        await auth.register(nameCtrl.text, email, pass);
      }
    } on DioException catch (e) {
      final d = e.response?.data;
      setState(() => error = (d is Map && d['error'] != null) ? '${d['error']}' : 'Failed. Check server URL.');
    } catch (_) {
      setState(() => error = 'Failed. Check server URL.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authErr = ref.watch(authProvider).error;
    return Scaffold(
      appBar: AppBar(title: const Text('FINSTACK', style: TextStyle(fontWeight: FontWeight.w700)), centerTitle: false),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: BrutalCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('FINSTACK', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                Text(isLogin ? 'LOGIN' : 'CREATE ACCOUNT', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                const Text('Enter your credentials to continue.', style: TextStyle(fontSize: 12)),
                const SizedBox(height: 16),
                if ((error ?? authErr) != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFFFDAD6), border: Border.all(width: 3)),
                    child: Text(error ?? authErr ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                  ),
                if (!isLogin) ...[
                  BrutalField(label: 'Name', controller: nameCtrl, hint: 'Your name'),
                  const SizedBox(height: 12),
                ],
                BrutalField(label: 'Email Address', controller: emailCtrl, hint: 'you@example.com'),
                const SizedBox(height: 12),
                BrutalField(label: 'Password', controller: passCtrl, hint: '••••••••', obscure: true),
                const SizedBox(height: 16),
                BrutalButton(label: busy ? 'Please wait…' : (isLogin ? 'Login' : 'Create account'), onPressed: busy ? null : submit),
                TextButton(
                  onPressed: () => setState(() { isLogin = !isLogin; error = null; ref.read(authProvider.notifier).clearError(); }),
                  child: Text(isLogin ? 'New here? Create account' : 'Have an account? Login'),
                ),
                const Divider(),
                TextButton.icon(
                  onPressed: () => setState(() => showServer = !showServer),
                  icon: const Icon(Icons.dns, size: 16),
                  label: const Text('Server settings', style: TextStyle(fontSize: 11)),
                ),
                if (showServer) ...[
                  const Text('On a real iPhone, localhost = the phone. Use your Mac LAN IP, e.g. http://192.168.1.5:3000/api',
                    style: TextStyle(fontSize: 11)),
                  const SizedBox(height: 8),
                  TextField(controller: serverCtrl, decoration: const InputDecoration(hintText: 'http://<Mac-IP>:3000/api', labelText: 'API base URL')),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: BrutalButton(label: 'Save URL', onPressed: () async {
                      await ApiClient.setBaseUrl(serverCtrl.text);
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Server: ${ApiClient.baseUrl}')));
                    }),
                  ),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
