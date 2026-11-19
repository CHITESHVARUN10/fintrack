import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/core/upi.dart';
import 'package:fintrack_flutter/features/transactions_page.dart';
import 'package:fintrack_flutter/features/upi_pay_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  List<RequestOptions> mockApi(Object Function(RequestOptions) respond) {
    final requests = <RequestOptions>[];
    final interceptor = InterceptorsWrapper(
      onRequest: (options, handler) {
        requests.add(options);
        handler.resolve(
          Response(requestOptions: options, data: respond(options)),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
    return requests;
  }

  testWidgets('Activity opens this month and lets an empty month go back', (
    tester,
  ) async {
    final requests = mockApi((_) => {'items': [], 'total': 0});
    final today = DateUtils.dateOnly(DateTime.now());

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const Scaffold(body: TransactionsPage()),
      ),
    );
    await tester.pumpAndSettle();

    final initial = requests.single.queryParameters;
    expect(
      DateTime.parse(initial['from'] as String).toLocal(),
      DateTime(today.year, today.month),
    );
    expect(
      DateTime.parse(initial['to'] as String).toLocal(),
      DateTime(
        today.year,
        today.month,
        today.day + 1,
      ).subtract(const Duration(milliseconds: 1)),
    );
    expect(find.textContaining('No transactions in'), findsOneWidget);

    await tester.tap(find.text('VIEW PREVIOUS MONTH'));
    await tester.pumpAndSettle();
    final older = requests.last.queryParameters;
    expect(
      DateTime.parse(older['from'] as String).toLocal(),
      DateTime(today.year, today.month - 1),
    );
    expect(
      DateTime.parse(older['to'] as String).toLocal(),
      DateTime(
        today.year,
        today.month,
      ).subtract(const Duration(milliseconds: 1)),
    );

    await tester.tap(find.text('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Previous month'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('All time'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Apply filters'));
    await tester.tap(find.text('Apply filters'));
    await tester.pumpAndSettle();
    expect(requests.last.queryParameters, isNot(contains('from')));
    expect(requests.last.queryParameters, isNot(contains('to')));
  });

  testWidgets('Payment feedback runs once and details update the saved entry', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    const channel = MethodChannel('finstack/payment_feedback');
    final messenger = tester.binding.defaultBinaryMessenger;
    var feedback = 0;
    messenger.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'playSuccess');
      feedback++;
      return null;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));

    final saved = {'_id': 'payment-1', 'category': 'Other', 'status': 'ACTIVE'};
    final requests = mockApi(
      (options) => switch (options.method) {
        'POST' => {'transaction': saved},
        'PATCH' => {
          'transaction': {...saved, ...options.data as Map},
        },
        _ => <String, dynamic>{},
      },
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const UpiPayPage(
          request: UpiPaymentRequest(
            raw: 'coffee@upi',
            payeeVpa: 'coffee@upi',
            payeeName: 'Corner Coffee',
            amountPaise: 18500,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(feedback, 0);
    await tester.tap(find.text('ALREADY PAID? SAVE IT'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('YES, SAVE'));
    await tester.pumpAndSettle();

    expect(find.text('Payment recorded'), findsOneWidget);
    expect(feedback, 1);
    await tester.tap(find.text('Other'));
    await tester.pumpAndSettle();
    final foodOption = find.text('Food').hitTestable();
    await tester.scrollUntilVisible(
      foodOption,
      -220,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(foodOption);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Coffee');
    await tester.ensureVisible(find.text('Save details'));
    await tester.tap(find.text('Save details'));
    await tester.pumpAndSettle();

    final patch = requests.singleWhere((request) => request.method == 'PATCH');
    expect(patch.path, '/transactions/payment-1');
    expect(patch.data, {'category': 'Food', 'productName': 'Coffee'});
    expect(requests.where((request) => request.method == 'POST'), hasLength(1));
    expect(find.text('Purchase details saved.'), findsOneWidget);
    expect(feedback, 1);
  });
}
