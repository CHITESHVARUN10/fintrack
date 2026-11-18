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
                Container(
                  width: 68,
                  height: 68,
                  decoration: BoxDecoration(
                    color: FinStackColors.brandYellow,
                    border: Border.all(color: FinStackColors.onSurface, width: 3),
                    boxShadow: const [
                      BoxShadow(
                        color: FinStackColors.onSurface,
                        offset: Offset(5, 5),
                        blurRadius: 0,
                      )
                    ],
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    'F',
                    style: TextStyle(fontSize: 38, fontWeight: FontWeight.w900, height: 1),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'FINSTACK',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -0.8),
                ),
                const SizedBox(height: 4),
                const BrutalTag(label: 'Opening your ledger', color: Colors.white),
                const SizedBox(height: 20),
                const SizedBox(
                  width: 120,
                  child: LinearProgressIndicator(minHeight: 5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
