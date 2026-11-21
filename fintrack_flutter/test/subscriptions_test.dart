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
}
