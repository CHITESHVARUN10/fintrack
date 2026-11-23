import 'package:fintrack_flutter/core/theme_mode.dart';
import 'package:fintrack_flutter/features/settings_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('settings exposes appearance and home-screen controls', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: finStackTheme(),
          home: const Scaffold(body: SettingsPage()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('APPEARANCE'), findsOneWidget);
    expect(find.text('HOME SCREEN'), findsOneWidget);
    expect(find.text('REFRESH WIDGETS'), findsOneWidget);

    await tester.tap(find.text('Dark'));
    await tester.pump();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(SettingsPage)),
    );
    expect(container.read(themeModeProvider), ThemeMode.dark);
  });
}
