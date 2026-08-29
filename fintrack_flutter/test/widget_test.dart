import 'package:flutter_test/flutter_test.dart';
import 'package:fintrack_flutter/main.dart';

void main() {
  testWidgets('FinStack app loads', (WidgetTester tester) async {
    await tester.pumpWidget(const FinStackApp());
    expect(find.text('FINSTACK'), findsOneWidget);
  });
}
