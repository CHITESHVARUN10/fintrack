import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/finstack_theme.dart';
import 'core/api_client.dart';
import 'core/auth_state.dart';
import 'widgets/brutal.dart';
import 'features/shell.dart';
import 'features/auth_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.init();
  runApp(const ProviderScope(child: FinStackApp()));
}

class FinStackApp extends ConsumerStatefulWidget {
  const FinStackApp({super.key});
  @override
  ConsumerState<FinStackApp> createState() => _FinStackAppState();
}

class _FinStackAppState extends ConsumerState<FinStackApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(authProvider.notifier).checkSession());
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    Widget home;
    if (auth.loading) {
      home = const _BootSplash();
    } else if (!auth.isAuthenticated) {
      home = const AuthPage();
    } else {
      home = const Shell();
    }
    return MaterialApp(
      title: 'FinStack',
      debugShowCheckedModeBanner: false,
      theme: finStackTheme(),
      home: home,
    );
  }
}

class _BootSplash extends StatelessWidget {
  const _BootSplash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BrutalGrid(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const FinStackMark(size: 84),
                const SizedBox(height: 16),
                const Text(
                  'FINSTACK',
                  style: TextStyle(
                    fontFamily: FinStackType.display,
                    fontSize: 30,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .8,
                  ),
                ),
                const SizedBox(height: 4),
                const Text('Opening your ledger', style: FinStackType.caption),
                const SizedBox(height: 16),
                Container(
                  width: 190,
                  decoration: brutal(
                    color: FinStackColors.surfaceContainer,
                    shadow: 3,
                  ),
                  padding: const EdgeInsets.all(2),
                  child: const LinearProgressIndicator(
                    minHeight: 8,
                    semanticsLabel: 'Opening your ledger',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
