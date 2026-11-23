import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/finstack_theme.dart';
import 'core/api_client.dart';
import 'core/auth_state.dart';
import 'core/home_widget_service.dart';
import 'core/theme_mode.dart';
import 'widgets/brutal.dart';
import 'features/shell.dart';
import 'features/auth_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ApiClient.init();
  await FinStackWidgetService.configure();
  final initialThemeMode = await loadThemeMode();
  runApp(
    ProviderScope(
      overrides: [
        themeModeProvider.overrideWith(
          (ref) => ThemeModeController(initialThemeMode),
        ),
      ],
      child: const FinStackApp(),
    ),
  );
}

class FinStackApp extends ConsumerStatefulWidget {
  const FinStackApp({super.key});
  @override
  ConsumerState<FinStackApp> createState() => _FinStackAppState();
}

class _FinStackAppState extends ConsumerState<FinStackApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future.microtask(() => ref.read(authProvider.notifier).checkSession());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() {
    if (ref.read(themeModeProvider) == ThemeMode.system && mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final mode = ref.watch(themeModeProvider);
    final platformDark =
        WidgetsBinding.instance.platformDispatcher.platformBrightness ==
        Brightness.dark;
    final dark =
        mode == ThemeMode.dark || (mode == ThemeMode.system && platformDark);
    FinStackColors.setDark(dark);
    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
        statusBarBrightness: dark ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: FinStackColors.surfaceLow,
        systemNavigationBarDividerColor: FinStackColors.surfaceLow,
        systemNavigationBarIconBrightness: dark
            ? Brightness.light
            : Brightness.dark,
      ),
    );

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
      locale: const Locale('en', 'GB'),
      supportedLocales: const [Locale('en', 'GB')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      debugShowCheckedModeBanner: false,
      theme: finStackTheme(),
      darkTheme: finStackTheme(dark: true),
      themeMode: mode,
      themeAnimationDuration: const Duration(milliseconds: 180),
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: dark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
        child: child ?? const SizedBox.shrink(),
      ),
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
                Text('Opening your ledger', style: FinStackType.caption),
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
