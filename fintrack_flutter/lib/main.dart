import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/finstack_theme.dart';
import 'core/api_client.dart';
import 'core/auth_state.dart';
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
      home = const Scaffold(body: Center(child: CircularProgressIndicator()));
    } else if (!auth.isAuthenticated) {
      home = const AuthPage();
    } else {
      home = const Shell();
    }
    return MaterialApp(title: 'FinStack', theme: finStackTheme(), home: home);
  }
}
