import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:fintrack_flutter/widgets/brutal.dart';

void main() {
  // Hermetic smoke test — the app's AuthPage requires a live backend, so
  // exercising the theme + brutal widget kit directly keeps CI green while
  // still catching theme-construction and widget-layout regressions.
  testWidgets('FinStack theme renders BrutalCard with content', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: finStackTheme(),
      home: const Scaffold(
        body: BrutalCard(child: Text('FINSTACK')),
      ),
    ));
    expect(find.text('FINSTACK'), findsOneWidget);
  });

  testWidgets('BrutalButton tappable', (tester) async {
    var pressed = false;
    await tester.pumpWidget(MaterialApp(
      theme: finStackTheme(),
      home: Scaffold(
        body: BrutalButton(label: 'Retry', onPressed: () => pressed = true),
      ),
    ));
    await tester.tap(find.text('RETRY'));
    expect(pressed, isTrue);
  });
}
