import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../core/auth_state.dart';
import '../theme/finstack_theme.dart';
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
    if (busy) return;
    dismissKeyboard(context);
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
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final auth = ref.read(authProvider.notifier);
      if (isLogin) {
        await auth.login(email, pass);
      } else {
        await auth.register(nameCtrl.text, email, pass);
      }
      // Hands the credential pair to iOS so Keychain can offer to save it.
      TextInput.finishAutofillContext(shouldSave: true);
    } on DioException catch (e) {
      final d = e.response?.data;
      if (mounted) {
        setState(
          () => error = (d is Map && d['error'] != null)
              ? '${d['error']}'
              : 'Failed. Check server URL.',
        );
      }
    } catch (_) {
      if (mounted) setState(() => error = 'Failed. Check server URL.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    nameCtrl.dispose();
    emailCtrl.dispose();
    passCtrl.dispose();
    serverCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveServer() async {
    dismissKeyboard(context);
    await ApiClient.setBaseUrl(serverCtrl.text);
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('Server: ${ApiClient.baseUrl}')));
  }

  @override
  Widget build(BuildContext context) {
    final message = error ?? ref.watch(authProvider).error;
    final title = isLogin ? 'Login' : 'Create account';
    return Scaffold(
      appBar: AppBar(title: const FinStackTitle('FinStack')),
      body: BrutalGrid(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(15, 18, 22, 28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: BrutalCard(
                shadow: 7,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 18,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Image.asset(
                          'assets/branding/finstack-logo.png',
                          width: 38,
                          height: 38,
                          excludeFromSemantics: true,
                        ),
                        const SizedBox(width: 8),
                        const Expanded(child: FinStackTitle('FinStack')),
                        const SizedBox(width: 6),
                        BrutalTag(
                          label: isLogin ? 'Welcome back' : 'New account',
                          color: isLogin
                              ? FinStackColors.accentCyan
                              : FinStackColors.brandYellow,
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Semantics(
                      header: true,
                      child: Text(
                        title.toUpperCase(),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Enter your credentials to continue.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (message != null) ...[
                      const SizedBox(height: 12),
                      Semantics(
                        liveRegion: true,
                        child: BrutalCard(
                          color: FinStackColors.errorContainer,
                          padding: const EdgeInsets.all(10),
                          shadow: 0,
                          border: 2,
                          child: Text(message),
                        ),
                      ),
                    ],
                    const SizedBox(height: 13),
                    AutofillGroup(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (!isLogin) ...[
                            BrutalField(
                              label: 'Name',
                              controller: nameCtrl,
                              hint: 'Your name',
                              autofillHints: const [AutofillHints.name],
                              textCapitalization: TextCapitalization.words,
                              textInputAction: TextInputAction.next,
                            ),
                            const SizedBox(height: 12),
                          ],
                          BrutalField(
                            label: 'Email address',
                            controller: emailCtrl,
                            hint: 'you@example.com',
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [
                              AutofillHints.username,
                              AutofillHints.email,
                            ],
                            enableSuggestions: false,
                            autocorrect: false,
                          ),
                          const SizedBox(height: 12),
                          BrutalField(
                            label: 'Password',
                            controller: passCtrl,
                            hint: '••••••••',
                            obscure: true,
                            textInputAction: TextInputAction.done,
                            autofillHints: [
                              isLogin
                                  ? AutofillHints.password
                                  : AutofillHints.newPassword,
                            ],
                            enableSuggestions: false,
                            autocorrect: false,
                            onSubmitted: (_) => submit(),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    BrutalButton(
                      label: busy ? 'Please wait…' : title,
                      block: true,
                      onPressed: busy ? null : submit,
                    ),
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                              isLogin = !isLogin;
                              error = null;
                              ref.read(authProvider.notifier).clearError();
                            }),
                      child: Text(
                        isLogin
                            ? 'New here? Create account'
                            : 'Have an account? Login',
                        style: const TextStyle(
                          decoration: TextDecoration.underline,
                          decorationThickness: 1.5,
                        ),
                      ),
                    ),
                    const Divider(height: 12),
                    const SizedBox(height: 6),
                    Semantics(
                      expanded: showServer,
                      child: BrutalButton(
                        label: 'Server settings',
                        icon: Icons.settings_outlined,
                        color: FinStackColors.surfaceContainer,
                        block: true,
                        onPressed: () =>
                            setState(() => showServer = !showServer),
                      ),
                    ),
                    if (showServer) ...[
                      const SizedBox(height: 14),
                      const BrutalCard(
                        color: FinStackColors.surfaceLow,
                        padding: EdgeInsets.all(9),
                        shadow: 0,
                        border: 1.5,
                        child: Text(
                          'To connect to a local server from your phone, use the computer’s network IP address.',
                          style: TextStyle(fontSize: 11.5),
                        ),
                      ),
                      const SizedBox(height: 10),
                      BrutalField(
                        label: 'API base URL',
                        controller: serverCtrl,
                        hint: 'http://192.168.1.5:3000/api',
                        keyboardType: TextInputType.url,
                        autocorrect: false,
                        enableSuggestions: false,
                      ),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: BrutalButton(
                          label: 'Save URL',
                          onPressed: _saveServer,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
