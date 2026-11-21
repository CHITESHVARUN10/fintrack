import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/vendors_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'vendor name opens details, monthly spending and products at a recorded price',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final vendor = <String, dynamic>{
        '_id': 'dairy',
        'label': 'UPI/UPI/Corner Dairy/HDFC/192837182333',
        'upiId': 'dairy@upi',
        'primaryCategory': 'Groceries',
        'offerings': [
          {'category': 'Groceries'},
          {'category': 'Food'},
        ],
        'products': [
          {'name': 'Milk', 'category': 'Groceries', 'typicalAmountPaise': 3000},
        ],
      };
      final now = DateTime.now().toUtc();
      final rows = [
        {
          '_id': 'tx1',
          'productName': 'Milk',
          'occurredAt': now.toIso8601String(),
          'type': 'EXPENSE',
          'mode': 'UPI',
          'amountPaise': 3000,
        },
        {
          '_id': 'tx2',
          'productName': 'Curd',
          'occurredAt': now.toIso8601String(),
          'type': 'EXPENSE',
          'mode': 'UPI',
          'amountPaise': 3000,
        },
      ];
      final calls = <RequestOptions>[];
      final interceptor = InterceptorsWrapper(
        onRequest: (request, handler) {
          calls.add(request);
          Object data = {};
          if (request.path == '/recipients') {
            data = {
              'items': [vendor],
            };
          } else if (request.method == 'PUT' &&
              request.path == '/recipients/dairy') {
            vendor['label'] = request.data['label'];
            data = {'recipient': vendor};
          } else if (request.path == '/vendors/dairy/transactions') {
            if (request.queryParameters['amountPaise'] == 3000) {
              data = {
                'productsAtAmount': [
                  {'name': 'Milk', 'count': 2},
                ],
              };
            } else {
              final skip = (request.queryParameters['skip'] as int?) ?? 0;
              data = {
                'vendor': vendor,
                'count': 2,
                'transactions': [rows[skip]],
                'totalPaise': 9000,
                'monthlyBuckets': [
                  {
                    'month': DateTime.utc(
                      now.year,
                      now.month - 1,
                    ).toIso8601String().substring(0, 7),
                    'paise': 3000,
                  },
                  {
                    'month': DateTime.utc(
                      now.year,
                      now.month,
                    ).toIso8601String().substring(0, 7),
                    'paise': 6000,
                  },
                ],
              };
            }
          }
          handler.resolve(Response(requestOptions: request, data: data));
        },
      );
      ApiClient.dio.interceptors.add(interceptor);
      addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

      await tester.pumpWidget(
        MaterialApp(theme: finStackTheme(), home: const VendorsPage()),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('UPI/UPI/'), findsNothing);
      expect(find.text('dairy@upi'), findsNothing);
      await tester.tap(find.text('Corner Dairy'));
      await tester.pumpAndSettle();
      expect(find.text('₹30 more (100%)'), findsOneWidget);

      await tester.tap(find.text('Transactions'));
      await tester.pumpAndSettle();
      expect(find.text('Milk'), findsOneWidget);
      await tester.tap(find.text('Load more transactions'));
      await tester.pumpAndSettle();
      expect(find.text('Curd'), findsOneWidget);

      await tester.tap(find.text('Products'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'e.g. 30'), '30');
      await tester.tap(find.byTooltip('Look up products'));
      await tester.pumpAndSettle();
      expect(find.text('Milk · 2 recorded payments'), findsOneWidget);

      await tester.tap(find.text('EDIT'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'e.g. Dairy Guy'),
        'Neighbourhood Dairy',
      );
      await tester.ensureVisible(find.text('SAVE'));
      await tester.tap(find.text('SAVE'));
      await tester.pumpAndSettle();
      expect(find.text('Neighbourhood Dairy'), findsOneWidget);
      final update = calls.singleWhere((call) => call.method == 'PUT');
      expect(update.data['categories'], ['Groceries', 'Food']);
    },
  );
}
