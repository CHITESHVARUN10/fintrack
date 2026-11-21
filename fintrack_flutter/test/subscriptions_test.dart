import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/subscriptions_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('linking a candidate refreshes subscription payment history', (
    tester,
  ) async {
    const subscription = {
      '_id': 'sub-1',
      'name': 'Stream Club',
      'amount': 499,
      'status': 'Active',
    };
    const transaction = {
      '_id': 'tx-1',
      'productName': 'Streaming renewal',
      'occurredAt': '2026-11-21',
      'amountPaise': 49900,
    };
    var linked = false;
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        final data = switch (request.path) {
          '/subscriptions' => [subscription],
          '/subscriptions/suggestions' => {'suggestions': []},
          '/subscriptions/sub-1' => subscription,
          '/subscriptions/sub-1/transactions' => {
            'linked': linked ? [transaction] : [],
            'suggestions': linked ? [] : [transaction],
            'totalPaidPaise': linked ? 49900 : 0,
          },
          '/subscriptions/sub-1/link-transaction' => () {
            expect(request.method, 'POST');
            expect(request.data, {'transactionId': 'tx-1'});
            linked = true;
            return const {'success': true};
          }(),
          _ => throw StateError('Unexpected request ${request.path}'),
        };
        handler.resolve(Response(requestOptions: request, data: data));
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(theme: finStackTheme(), home: const SubscriptionsPage()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('HISTORY & DETAIL'));
    await tester.pumpAndSettle();
    expect(find.text('No linked payments yet.'), findsOneWidget);

    final link = find.text('LINK');
    await tester.ensureVisible(link);
    await tester.tap(link);
    await tester.pumpAndSettle();

    expect(linked, isTrue);
    expect(find.text('No linked payments yet.'), findsNothing);
    expect(find.text('No unlinked matching payments.'), findsOneWidget);
    expect(find.text('Streaming renewal'), findsOneWidget);
  });

  testWidgets('changing a plan price keeps the old amount in history', (
    tester,
  ) async {
    var history = <Map<String, dynamic>>[
      {'amount': 500, 'effectiveFrom': '2026-03-01T00:00:00.000Z'},
    ];
    Map<String, dynamic> doc() => {
      '_id': 'sub-1',
      'name': 'Coding Agents',
      'amount': 500,
      'frequency': 'monthly',
      'billingDate': 5,
      'status': 'Active',
      'priceHistory': List<Map<String, dynamic>>.from(history),
    };
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        final data = switch (request.path) {
          '/subscriptions' => [doc()],
          '/subscriptions/suggestions' => {'suggestions': []},
          '/subscriptions/sub-1' => doc(),
          '/subscriptions/sub-1/transactions' => {
            'linked': [],
            'suggestions': [],
            'totalPaidPaise': 0,
          },
          '/subscriptions/sub-1/price-change' => () {
            expect(request.method, 'POST');
            expect(request.data['amount'], 1100);
            expect(
              request.data['effectiveFrom'],
              matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')),
            );
            history = [
              ...history,
              {
                'amount': 1100,
                'effectiveFrom':
                    '${request.data['effectiveFrom']}T00:00:00.000Z',
              },
            ];
            return {...doc(), 'amount': 1100};
          }(),
          _ => throw StateError('Unexpected request ${request.path}'),
        };
        handler.resolve(Response(requestOptions: request, data: data));
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(theme: finStackTheme(), home: const SubscriptionsPage()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('HISTORY & DETAIL'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('CHANGE PRICE'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '1100');
    await tester.tap(find.text('SAVE PRICE'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('PRICE HISTORY'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('₹500'), findsOneWidget);
    expect(find.text('₹1,100'), findsWidgets);
  });
}
