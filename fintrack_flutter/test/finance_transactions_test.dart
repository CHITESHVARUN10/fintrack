import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:fintrack_flutter/widgets/finance_transactions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  List<RequestOptions> mockApi() {
    final requests = <RequestOptions>[];
    final interceptor = InterceptorsWrapper(
      onRequest: (options, handler) {
        requests.add(options);
        handler.resolve(
          Response(
            requestOptions: options,
            data: {'items': [], 'hasMore': false, 'canManage': true},
          ),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
    return requests;
  }

  Future<void> openSheet(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 900);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showFinanceTransactions(
                context,
                kind: 'fd',
                id: 'fd1',
                name: 'HDFC Fixed Deposit',
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }

  Future<void> openAvailable(WidgetTester tester) async {
    await tester.tap(find.text('Linked transactions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Link deposit funding'));
    await tester.pumpAndSettle();
  }

  Map<String, dynamic> lastQuery(List<RequestOptions> requests) =>
      requests.last.queryParameters;

  testWidgets('filters available transactions by exact paise amount', (
    tester,
  ) async {
    final requests = mockApi();
    await openSheet(tester);
    await openAvailable(tester);

    expect(lastQuery(requests)['view'], 'available');
    expect(lastQuery(requests)['role'], 'deposit');

    await tester.enterText(
      find.widgetWithText(TextField, '1250.50'),
      '1250.50',
    );
    await tester.tap(find.byTooltip('Search by amount'));
    await tester.pumpAndSettle();

    final query = lastQuery(requests);
    expect(query['amountPaise'], 125050);
    expect(query['page'], 1);
  });

  testWidgets('a half-typed amount is rejected without changing the search', (
    tester,
  ) async {
    final requests = mockApi();
    await openSheet(tester);
    await openAvailable(tester);
    final before = requests.length;

    await tester.enterText(find.widgetWithText(TextField, '1250.50'), '12.5.0');
    await tester.tap(find.byTooltip('Search by amount'));
    await tester.pumpAndSettle();

    expect(requests.length, before);
    expect(
      find.text('Enter a rupee amount like 1250 or 1250.50.'),
      findsOneWidget,
    );
  });

  testWidgets('date range is inclusive of the chosen local days', (tester) async {
    final requests = mockApi();
    await openSheet(tester);
    await openAvailable(tester);

    await tester.tap(find.text('ANY START DATE'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    final today = DateUtils.dateOnly(DateTime.now());
    final from = lastQuery(requests)['from'] as String;
    expect(from, '${today.year.toString().padLeft(4, '0')}-'
        '${today.month.toString().padLeft(2, '0')}-'
        '${today.day.toString().padLeft(2, '0')}');

    await tester.tap(find.text('ANY END DATE'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(lastQuery(requests)['to'], from);
  });

  testWidgets('backwards dates are clamped into a valid range', (tester) async {
    final requests = mockApi();
    await openSheet(tester);
    await openAvailable(tester);

    await tester.tap(find.text('ANY END DATE'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('ANY START DATE'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    final query = lastQuery(requests);
    expect(
      DateTime.parse(query['from'] as String).isAfter(
        DateTime.parse(query['to'] as String),
      ),
      isFalse,
    );
  });

  testWidgets('clear filters restores the unfiltered search and rows', (
    tester,
  ) async {
    final requests = mockApi();
    await openSheet(tester);
    await openAvailable(tester);

    await tester.enterText(find.widgetWithText(TextField, '1250.50'), '250');
    await tester.tap(find.byTooltip('Search by amount'));
    await tester.pumpAndSettle();
    expect(lastQuery(requests)['amountPaise'], 25000);

    await tester.tap(find.text('CLEAR FILTERS'));
    await tester.pumpAndSettle();

    final query = lastQuery(requests);
    expect(query.containsKey('amountPaise'), isFalse);
    expect(query.containsKey('from'), isFalse);
    expect(query.containsKey('to'), isFalse);
    expect(find.text('CLEAR FILTERS'), findsNothing);
  });

  testWidgets('emptying the amount field drops the amount filter', (
    tester,
  ) async {
    final requests = mockApi();
    await openSheet(tester);
    await openAvailable(tester);

    await tester.enterText(find.widgetWithText(TextField, '1250.50'), '250');
    await tester.tap(find.byTooltip('Search by amount'));
    await tester.pumpAndSettle();
    expect(lastQuery(requests)['amountPaise'], 25000);

    await tester.enterText(find.widgetWithText(TextField, '1250.50'), '');
    await tester.tap(find.byTooltip('Search by amount'));
    await tester.pumpAndSettle();

    expect(lastQuery(requests).containsKey('amountPaise'), isFalse);
  });

  testWidgets('linked rows show a readable vendor name from UPI narration', (
    tester,
  ) async {
    final interceptor = InterceptorsWrapper(
      onRequest: (options, handler) => handler.resolve(
        Response(
          requestOptions: options,
          data: {
            'items': [
              {
                '_id': 'tx1',
                'type': 'INCOME',
                'amountPaise': 500000,
                'occurredAt': '2026-11-18T10:00:00.000Z',
                'sender': {
                  'name': 'UPI/DR/123456789/ACME SERVICES/BANK',
                  'upiId': 'acme@okhdfcbank',
                },
              },
            ],
            'hasMore': false,
            'canManage': true,
          },
        ),
      ),
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await openSheet(tester);

    expect(find.text('ACME SERVICES'), findsOneWidget);
    expect(find.textContaining('₹5,000'), findsOneWidget);
  });
}
