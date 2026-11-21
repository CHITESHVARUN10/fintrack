import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/core/upi.dart';
import 'package:fintrack_flutter/features/activity_review.dart';
import 'package:fintrack_flutter/features/income_page.dart';
import 'package:fintrack_flutter/features/transactions_page.dart';
import 'package:fintrack_flutter/features/upi_pay_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> revealOffset(
  WidgetTester tester,
  Finder target, {
  double delta = 100,
}) async {
  if (target.evaluate().isNotEmpty) {
    await tester.ensureVisible(target);
  } else {
    final scrollable = find
        .descendant(
          of: find.byType(ActivityOffsetSheet),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(target, delta, scrollable: scrollable);
  }
  await tester.pumpAndSettle();
}

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

  testWidgets('mobile filters use the selected type and saved merchant', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final requests = mockApi(
      (options) => options.path == '/recipients'
          ? {
              'items': [
                {
                  '_id': 'vendor1',
                  'label': 'UPI/Coffee Shop/HDFC/190012221111',
                  'upiId': 'coffee@upi',
                },
              ],
            }
          : {'items': [], 'total': 0},
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const Scaffold(body: TransactionsPage()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Any type'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Income').last);
    await tester.pumpAndSettle();
    final search = find.widgetWithText(TextField, 'Search saved merchants');
    await tester.ensureVisible(search);
    await tester.enterText(search, 'Coff');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Coffee Shop'));
    await tester.tap(find.text('Coffee Shop'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Apply filters'));
    await tester.tap(find.text('Apply filters'));
    await tester.pumpAndSettle();
    final request = requests.lastWhere((r) => r.path == '/transactions');
    expect(request.queryParameters['type'], 'INCOME');
    expect(request.queryParameters['vendorId'], 'vendor1');
    expect(request.queryParameters['vendor'], 'coffee@upi');
  });

  testWidgets(
    'deleting income closes the root dialog without popping the nested page',
    (tester) async {
      var deleted = false;
      final requests = mockApi((options) {
        if (options.method == 'DELETE') {
          deleted = true;
          return {'message': 'deleted'};
        }
        return [
          if (!deleted)
            {
              '_id': 'pocket',
              'title': 'Pocket money',
              'amount': 500,
              'category': 'Pocket Money',
            },
        ];
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: finStackTheme(),
          home: Navigator(
            onGenerateRoute: (_) => MaterialPageRoute<void>(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const IncomePage()),
                  ),
                  child: const Text('Open income'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open income'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Delete'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Pocket money'), findsOneWidget);
      await tester.tap(find.byTooltip('Delete'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.byType(IncomePage), findsOneWidget);
      expect(find.text('Pocket money'), findsNothing);
      expect(requests.where((request) => request.method == 'DELETE').length, 1);
    },
  );

  testWidgets(
    'Activity shows a concise merchant, saved category and an offset pair',
    (tester) async {
      final credit = <String, Object?>{
        '_id': 'credit',
        'type': 'INCOME',
        'mode': 'BANK',
        'status': 'ACTIVE',
        'occurredAt': DateTime.now().toIso8601String(),
        'amountPaise': 60050,
        'recipient': {'name': 'UPI/Maya/HDFC/901829191919'},
        'category': 'Other',
      };
      final debit = {
        '_id': 'debit',
        'type': 'EXPENSE',
        'mode': 'UPI',
        'status': 'ACTIVE',
        'occurredAt': DateTime.now().toIso8601String(),
        'amountPaise': 60050,
        'recipient': {'name': 'UPI/Dinner House/AXIS/918192919191'},
        'category': 'Food',
      };
      Map? offset;
      final requests = mockApi((options) {
        if (options.method == 'PATCH') {
          credit.addAll(
            Map<String, Object?>.from(options.data as Map)
              ..removeWhere((key, value) => value == null),
          );
          return {'transaction': credit};
        }
        if (options.method == 'PUT') {
          offset = {'purpose': options.data['purpose'], 'transaction': debit};
          return {'offset': offset};
        }
        return switch (options.path) {
          '/transactions/credit' => {
            'transaction': {...credit, 'isOffset': offset != null},
            'canModify': true,
            'offset': ?offset,
          },
          '/transactions/credit/offset-candidates' => {
            'items': [debit],
          },
          '/recipients/categories' => {
            'categories': ['Income', 'Other'],
          },
          _ => {
            'items': [credit],
            'total': 1,
          },
        };
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: finStackTheme(),
          home: const Scaffold(body: TransactionsPage()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Maya'));
      expect(find.text('BANK'), findsOneWidget);
      expect(find.text('UPI/Maya/HDFC/901829191919'), findsNothing);
      await tester.tap(find.text('Maya'));
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(OutlinedButton, 'Other'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Search category'),
        'Inco',
      );
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ListTile, 'Other'), findsNothing);
      await tester.tap(find.text('Income'));
      await tester.pumpAndSettle();
      final saveCategory = find.text('Save category');
      await tester.ensureVisible(saveCategory);
      await tester.tap(saveCategory);
      await tester.pumpAndSettle();
      expect(find.text('Saved ✓'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.text('Save category'), findsOneWidget);
      final findMatch = find.text('Find matching transaction');
      await tester.ensureVisible(findMatch);
      await tester.tap(findMatch);
      await tester.pumpAndSettle();
      await revealOffset(tester, find.text('Dinner House'));
      await tester.tap(find.text('Dinner House'));
      await tester.pumpAndSettle();
      final purpose = find.widgetWithText(
        TextField,
        'e.g. Dinner reimbursement',
      );
      await revealOffset(tester, purpose, delta: -100);
      await tester.enterText(purpose, 'Tuesday dinner');
      final saveOffset = find.text('SAVE OFFSET PAIR');
      await tester.ensureVisible(saveOffset);
      await tester.tap(saveOffset);
      await tester.pumpAndSettle();
      expect(requests.singleWhere((r) => r.method == 'PUT').data, {
        'transactionId': 'debit',
        'purpose': 'Tuesday dinner',
      });
      await tester.ensureVisible(find.text('Tuesday dinner'));
      expect(find.text('Tuesday dinner'), findsOneWidget);
    },
  );

  testWidgets('offset waits for the purchase and returned change', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final credit = {
      '_id': 'credit',
      'type': 'INCOME',
      'mode': 'BANK',
      'amountPaise': 749900,
      'recipient': {'name': 'Friend'},
    };
    final requests = mockApi(
      (request) => {
        'items': [
          {
            '_id': 'game',
            'type': 'EXPENSE',
            'mode': 'UPI',
            'amountPaise': 600000,
            'recipient': {'name': 'Game store'},
          },
          {
            '_id': 'change',
            'type': 'EXPENSE',
            'mode': 'UPI',
            'amountPaise': 149900,
            'recipient': {'name': 'Returned change'},
          },
        ],
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                builder: (_) => ActivityOffsetSheet(transaction: credit),
              ),
              child: const Text('Offset this entry'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Offset this entry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Paid for someone'));
    await revealOffset(tester, find.text('Game store'));
    await tester.tap(find.text('Game store'));
    await tester.pumpAndSettle();
    expect(find.text('₹1,499 more outgoing needed'), findsOneWidget);
    expect(requests.where((request) => request.method == 'PUT'), isEmpty);
    await revealOffset(tester, find.text('Returned change'));
    await tester.tap(find.text('Returned change'));
    await tester.pumpAndSettle();
    expect(find.text('Balanced · 3 entries'), findsOneWidget);
    await tester.tap(find.text('SAVE OFFSET GROUP'));
    await tester.pumpAndSettle();
    expect(requests.singleWhere((r) => r.method == 'PUT').data, {
      'transactionIds': ['game', 'change'],
      'purpose': 'Paid for someone',
      'kind': 'purchase_on_behalf',
    });
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
        _ =>
          options.path == '/recipients/categories'
              ? {
                  'categories': ['Studio supplies'],
                }
              : <String, dynamic>{},
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
    final categorySearch = find.widgetWithText(TextField, 'Search category');
    await tester.enterText(categorySearch, 'Studio supplies');
    await tester.pumpAndSettle();
    expect(find.text('Studio supplies'), findsWidgets);
    await tester.enterText(categorySearch, 'Investment');
    await tester.pumpAndSettle();
    expect(find.text('Investment'), findsWidgets);
    await tester.enterText(categorySearch, 'Food');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Food'));
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

  testWidgets('QR payment applies the saved category of a legacy vendor', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    const vendorName = 'UPI/UPI/Corner Coffee/HDFC/123456789012';
    final saved = {
      '_id': 'payment-2',
      'category': 'Other',
      'status': 'RECONCILED',
    };
    final requests = mockApi(
      (options) => switch ((options.method, options.path)) {
        ('GET', '/recipients/by-key') => {'vendor': null},
        ('GET', '/recipients') => {
          'items': [
            {'label': 'Corner Coffee Annex', 'category': 'Shopping'},
            {
              'label': 'Corner Coffee',
              'category': 'Entertainment',
              'upiId': 'different@upi',
            },
            {'label': vendorName, 'primaryCategory': 'Food'},
          ],
        },
        ('POST', '/transactions') => {'transaction': saved, 'reconciled': true},
        ('PATCH', '/transactions/payment-2') => {
          'transaction': {...saved, 'category': 'Food'},
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
            amountPaise: 3000,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('SAVED PAYEE'), findsOneWidget);
    await tester.tap(find.text('ALREADY PAID? SAVE IT'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('YES, SAVE'));
    await tester.pumpAndSettle();

    final post = requests.singleWhere((request) => request.method == 'POST');
    expect(post.data['category'], 'Food');
    expect(post.data['recipient']['name'], vendorName);
    final patch = requests.singleWhere((request) => request.method == 'PATCH');
    expect(patch.data, {'category': 'Food'});
    expect(find.text('Food'), findsOneWidget);
  });

  testWidgets('personal VPAs copy the ID instead of opening a pay intent', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({'fintrack_upi_app': 'gpay'});
    mockApi(
      (options) => switch (options.path) {
        '/recipients/by-key' => {'vendor': null},
        '/recipients' => {'items': []},
        _ => <String, dynamic>{},
      },
    );
    final messenger = tester.binding.defaultBinaryMessenger;
    String? copied;
    messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        copied = (call.arguments as Map)['text'] as String?;
      }
      return null;
    });
    addTearDown(
      () => messenger.setMockMethodCallHandler(SystemChannels.platform, null),
    );
    final upiCalls = <MethodCall>[];
    messenger.setMockMethodCallHandler(const MethodChannel('finstack/upi'), (
      call,
    ) async {
      upiCalls.add(call);
      return true;
    });
    addTearDown(
      () => messenger.setMockMethodCallHandler(
        const MethodChannel('finstack/upi'),
        null,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const UpiPayPage(
          request: UpiPaymentRequest(
            raw: 'asha@upi',
            payeeVpa: 'asha@upi',
            payeeName: 'Asha',
            amountPaise: 5000,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('PAY ₹50 IN UPI APP'));
    await tester.pumpAndSettle();

    expect(find.text('PAY THIS ONE INSIDE THE UPI APP'), findsOneWidget);
    expect(find.text('OPEN GOOGLE PAY'), findsOneWidget);
    expect(copied, 'asha@upi');
    expect(upiCalls.where((call) => call.method == 'open'), isEmpty);
  });
}
