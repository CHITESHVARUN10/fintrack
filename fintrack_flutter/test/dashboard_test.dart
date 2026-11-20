import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/dashboard_page.dart';
import 'package:fintrack_flutter/widgets/spending_breakdown.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('both spending rings update their centers from the legend', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: ListViewFixture())),
    );
    expect(
      find.descendant(
        of: find.byType(SpendingBreakdown).first,
        matching: find.text('₹1.0k'),
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Groceries'));
    await tester.pump();
    expect(find.text('Groceries'), findsNWidgets(2));
    expect(find.text('75%'), findsNWidgets(2));

    final ring = find
        .descendant(
          of: find.byType(SpendingBreakdown).first,
          matching: find.byType(MouseRegion),
        )
        .first;
    final center = tester.getCenter(ring);
    final gesture = await tester.startGesture(center + const Offset(-98, -44));
    await gesture.moveBy(const Offset(6, -38));
    await tester.pump();
    expect(find.text('Fuel'), findsNWidgets(2));
    await gesture.moveTo(center + const Offset(94, -54));
    await tester.pump();
    expect(find.text('Groceries'), findsNWidgets(2));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(find.text('Groceries'), findsNWidgets(2));

    await tester.ensureVisible(find.text('Corner Store'));
    await tester.tap(find.text('Corner Store'));
    await tester.pump();
    expect(find.text('Corner Store'), findsNWidgets(2));
    expect(find.text('50%'), findsNWidgets(3));
  });

  testWidgets(
    'Paid animates and dismisses just the current billing occurrence',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      FlutterSecureStorage.setMockInitialValues({});
      final firstDue = DateTime.now();
      var due = firstDue;
      final requests = <RequestOptions>[];
      final interceptor = InterceptorsWrapper(
        onRequest: (request, handler) {
          requests.add(request);
          handler.resolve(
            Response(
              requestOptions: request,
              data: {
                'transactionVendorBreakdown': {
                  'UPI/Corner Café/HDFC/123456789': 500,
                  'UPI/DR/987654321/CORNER CAFÉ/ICICI': 250,
                  'UPI/DR/123456789/HDFC': 99,
                },
                'upcomingPayments': [
                  {
                    'id': 'subscription-1',
                    'type': 'subscription',
                    'name': 'Stream Plan',
                    'amount': 99,
                    'dueDate': due.toIso8601String(),
                  },
                  {
                    'id': 'investment-1',
                    'type': 'sip',
                    'name': 'Monthly SIP',
                    'amount': 400,
                    'dueDate': due.toIso8601String(),
                  },
                ],
              },
            ),
          );
        },
      );
      ApiClient.dio.interceptors.add(interceptor);
      addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

      Future<void> showDashboard() async {
        await tester.pumpWidget(
          const MaterialApp(home: Scaffold(body: DashboardPage())),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text('Corner Café'),
          260,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('₹750'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('Monthly SIP'),
          280,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
      }

      await showDashboard();
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('PAY VIA UPI'), findsOneWidget);
      await tester.ensureVisible(find.text('Paid'));
      await tester.tap(find.text('Paid'));
      await tester.pump(const Duration(milliseconds: 120));
      expect(find.text('PAID'), findsOneWidget);
      expect(find.text('Stream Plan'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.text('Stream Plan'), findsNothing);
      expect(find.text('Monthly SIP'), findsOneWidget);
      expect(requests.map((request) => request.method), ['GET']);

      await tester.pumpWidget(const SizedBox.shrink());
      await showDashboard();
      expect(find.text('Stream Plan'), findsNothing);

      due = DateTime(firstDue.year, firstDue.month + 1, firstDue.day);
      await tester.pumpWidget(const SizedBox.shrink());
      await showDashboard();
      expect(find.text('Stream Plan'), findsOneWidget);
      expect(find.text('Paid'), findsOneWidget);
    },
  );
}

class ListViewFixture extends StatelessWidget {
  const ListViewFixture({super.key});

  @override
  Widget build(BuildContext context) => ListView(
    children: const [
      SpendingBreakdown(
        title: 'Category breakdown',
        emptyMessage: 'No spending',
        entries: [
          (label: 'Groceries', value: 750),
          (label: 'Fuel', value: 250),
        ],
        accent: Colors.pink,
      ),
      SpendingBreakdown(
        title: 'Vendor breakdown',
        emptyMessage: 'No spending',
        entries: [
          (label: 'Corner Store', value: 500),
          (label: 'Other vendors', value: 500),
        ],
        accent: Colors.cyan,
      ),
    ],
  );
}
