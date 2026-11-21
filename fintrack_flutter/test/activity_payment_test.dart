import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/core/upi.dart';
import 'package:fintrack_flutter/features/income_page.dart';
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

    final initial = requests
        .singleWhere((request) => request.path == '/transactions')
        .queryParameters;
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

  testWidgets('Activity can create and save a custom category', (tester) async {
    final requests = mockApi(
      (options) => switch ((options.method, options.path)) {
        ('GET', '/recipients/categories') => {
          'categories': ['Other', 'Investment'],
        },
        ('POST', '/recipients/categories') => {'category': 'Studio supplies'},
        _ => {'items': [], 'total': 0},
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const Scaffold(body: TransactionsPage()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('ADD'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('New category'));
    await tester.tap(find.text('New category'));
    await tester.pumpAndSettle();
    final entry = find.widgetWithText(TextField, 'Category name');
    await tester.enterText(entry, 'Studio supplies');
    await tester.tap(find.text('Create'));
    await tester.pumpAndSettle();

    expect(find.text('Studio supplies'), findsOneWidget);
    final amount = find.widgetWithText(TextField, '0');
    await tester.ensureVisible(amount);
    await tester.enterText(amount, '250');
    final submit = find.text('Add transaction');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    final saved = requests.singleWhere(
      (request) => request.method == 'POST' && request.path == '/transactions',
    );
    expect(saved.data['category'], 'Studio supplies');
    expect(saved.data['amountPaise'], 25000);
  });

  testWidgets('Income links a suggested credit from the mobile list', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var linked = false;
    final credit = {
      '_id': 'credit1',
      'type': 'INCOME',
      'amountPaise': 223000,
      'occurredAt': '2026-11-03T12:00:00Z',
      'sender': {'name': 'Studio client'},
      'suggested': true,
    };
    final requests = mockApi((options) {
      if (options.path == '/income') {
        return [
          {
            '_id': 'income1',
            'title': 'Freelance design',
            'category': 'Freelance',
            'payPattern': 'variable',
            'taxable': true,
          },
        ];
      }
      if (options.method == 'PUT') {
        linked = true;
        return {'linked': true};
      }
      final showingLinks = options.queryParameters['view'] == 'linked';
      return {
        'items': [
          if (!showingLinks && !linked) credit,
          if (showingLinks && linked)
            {
              ...credit,
              'suggested': false,
              'financeLink': {'role': 'receipt'},
            },
        ],
        'canManage': true,
        'hasMore': false,
      };
    });
    await tester.pumpWidget(
      MaterialApp(theme: finStackTheme(), home: const IncomePage()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('TRANSACTIONS'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Linked transactions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Link income received').last);
    await tester.pumpAndSettle();
    expect(find.text('SUGGESTED MATCH'), findsOneWidget);
    await tester.tap(find.text('LINK'));
    await tester.pumpAndSettle();
    expect(find.text('Transaction linked.'), findsOneWidget);
    final request = requests.singleWhere((request) => request.method == 'PUT');
    expect(request.path, '/income/income1/transactions/credit1');
    expect(request.data, {'role': 'receipt'});
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
