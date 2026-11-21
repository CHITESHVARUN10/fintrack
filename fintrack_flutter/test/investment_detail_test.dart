import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/investment_detail_page.dart';
import 'package:fintrack_flutter/features/investments_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> stock({
  num quantity = 40,
  num? originalQuantity = 100,
  List<Map<String, dynamic>> sales = const [],
  num? totalDividendPaise = 125000,
}) => {
  '_id': 'inv-1',
  'investmentType': 'stock',
  'stockName': 'Infosys',
  'ticker': 'INFY',
  'buyPrice': 1200,
  'quantity': quantity,
  'originalQuantity': ?originalQuantity,
  'currentPrice': 1500,
  'totalInvested': 120000,
  'status': 'Active',
  'sales': sales,
  'totalDividendPaise': ?totalDividendPaise,
};

void main() {
  void useTallView(WidgetTester tester) {
    tester.view.physicalSize = const Size(1100, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  testWidgets('detail shows position, dividends and sale history', (
    tester,
  ) async {
    useTallView(tester);
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        expect(request.path, '/investments/inv-1');
        handler.resolve(
          Response(
            requestOptions: request,
            data: stock(
              sales: [
                {
                  '_id': 'sale-1',
                  'quantity': 60,
                  'pricePerShare': 1400,
                  'soldAt': '2026-09-12T00:00:00.000Z',
                },
              ],
            ),
          ),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const InvestmentDetailPage(id: 'inv-1'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Infosys'), findsWidgets);
    expect(find.text('₹60,000'), findsOneWidget); // 40 remaining × ₹1500
    expect(find.text('REMAINING'), findsOneWidget);
    expect(find.text('40'), findsOneWidget);
    expect(find.text('100'), findsOneWidget);
    expect(find.text('60'), findsWidgets);
    expect(find.text('₹1,250'), findsOneWidget); // dividends, 125000 paise
    expect(find.textContaining('1 sale · ₹84,000 proceeds'), findsOneWidget);
    expect(find.textContaining('60 shares × ₹1,400'), findsOneWidget);
  });

  testWidgets('updating the current price PUTs and refreshes the valuation', (
    tester,
  ) async {
    useTallView(tester);
    final requests = <Map<String, dynamic>>[];
    num price = 1500;
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        if (request.method == 'PUT') {
          requests.add(Map<String, dynamic>.from(request.data as Map));
          price = (request.data as Map)['currentPrice'] as num;
        }
        handler.resolve(
          Response(
            requestOptions: request,
            data: {...stock(), 'currentPrice': price},
          ),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const InvestmentDetailPage(id: 'inv-1'),
      ),
    );
    await tester.pumpAndSettle();

    final field = find.widgetWithText(TextField, '1500');
    await tester.ensureVisible(field);
    await tester.enterText(field, '1600');
    final update = find.text('UPDATE');
    await tester.ensureVisible(update);
    await tester.tap(update);
    await tester.pumpAndSettle();

    expect(requests.single, {'currentPrice': 1600});
    expect(find.text('₹64,000'), findsOneWidget); // 40 × ₹1600
  });

  testWidgets('recording a sale posts quantity, price, date and requestId', (
    tester,
  ) async {
    Map<String, dynamic>? posted;
    var remaining = 40;
    useTallView(tester);
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        if (request.method == 'POST') {
          expect(request.path, '/investments/inv-1/sales');
          posted = Map<String, dynamic>.from(request.data as Map);
          remaining = remaining - (posted!['quantity'] as num).toInt();
        }
        handler.resolve(
          Response(
            requestOptions: request,
            data: stock(quantity: remaining),
          ),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const InvestmentDetailPage(id: 'inv-1'),
      ),
    );
    await tester.pumpAndSettle();

    final record = find.text('RECORD SALE');
    await tester.ensureVisible(record);
    await tester.tap(record);
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('sale-quantity')), '10');
    await tester.enterText(find.byKey(const Key('sale-price')), '1550');
    await tester.pump();

    final confirm = find.text('CONFIRM SALE');
    await tester.ensureVisible(confirm);
    await tester.tap(confirm);
    await tester.pumpAndSettle();

    expect(posted, isNotNull);
    expect(posted!['quantity'], 10);
    expect(posted!['pricePerShare'], 1550);
    expect('${posted!['soldAt']}', matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect('${posted!['requestId']}'.length, greaterThan(8));
    expect(find.text('Sale recorded.'), findsOneWidget);
  });

  testWidgets('sale requestId stays stable when the first attempt fails', (
    tester,
  ) async {
    useTallView(tester);
    final requestIds = <String>[];
    var attempt = 0;
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        if (request.method == 'POST') {
          attempt++;
          requestIds.add('${(request.data as Map)['requestId']}');
          if (attempt == 1) {
            handler.reject(
              DioException(
                requestOptions: request,
                response: Response(
                  requestOptions: request,
                  statusCode: 503,
                  data: {'error': 'Server busy'},
                ),
              ),
            );
            return;
          }
        }
        handler.resolve(Response(requestOptions: request, data: stock()));
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const InvestmentDetailPage(id: 'inv-1'),
      ),
    );
    await tester.pumpAndSettle();

    final record = find.text('RECORD SALE');
    await tester.ensureVisible(record);
    await tester.tap(record);
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('sale-quantity')), '5');
    await tester.enterText(find.byKey(const Key('sale-price')), '1500');
    await tester.pump();
    await tester.tap(find.text('CONFIRM SALE'));
    await tester.pumpAndSettle();

    expect(find.text('Server busy'), findsOneWidget);

    await tester.tap(find.text('CONFIRM SALE'));
    await tester.pumpAndSettle();

    expect(requestIds, hasLength(2));
    expect(requestIds.first, requestIds.last);
  });

  testWidgets('sale validation blocks quantities above the remaining shares', (
    tester,
  ) async {
    useTallView(tester);
    var posts = 0;
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        if (request.method == 'POST') posts++;
        handler.resolve(Response(requestOptions: request, data: stock()));
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const InvestmentDetailPage(id: 'inv-1'),
      ),
    );
    await tester.pumpAndSettle();

    final record = find.text('RECORD SALE');
    await tester.ensureVisible(record);
    await tester.tap(record);
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('sale-quantity')), '41');
    await tester.enterText(find.byKey(const Key('sale-price')), '1550');
    await tester.pump();

    final confirm = find.text('CONFIRM SALE');
    await tester.ensureVisible(confirm);
    await tester.tap(confirm);
    await tester.pumpAndSettle();

    expect(posts, 0);
    expect(
      find.text('You can sell at most 40 remaining shares.'),
      findsOneWidget,
    );
  });

  testWidgets('detail falls back to the list payload on an older server', (
    tester,
  ) async {
    useTallView(tester);
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        handler.reject(
          DioException(
            requestOptions: request,
            response: Response(
              requestOptions: request,
              statusCode: 404,
              data: {'error': 'Not found'},
            ),
          ),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: InvestmentDetailPage(
          id: 'inv-1',
          initial: {
            '_id': 'inv-1',
            'investmentType': 'stock',
            'stockName': 'Infosys',
            'quantity': 40,
            'currentPrice': 1500,
            'buyPrice': 1200,
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Infosys'), findsWidgets);
    expect(find.text('₹60,000'), findsOneWidget);
    expect(find.text('RECORD SALE'), findsNothing);
    expect(find.textContaining('cannot show sale history'), findsOneWidget);
  });

  testWidgets('tapping an investment card opens its detail page', (
    tester,
  ) async {
    useTallView(tester);
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        final data = switch (request.path) {
          '/investments' => [stock()],
          '/investments/summary' => {
            'overall': {'totalInvested': 120000, 'totalCurrentValue': 60000},
          },
          '/investments/inv-1' => stock(),
          '/investments/inv-1/transactions' => {
            'items': <Map>[],
            'hasMore': false,
            'canManage': true,
          },
          _ => throw StateError('Unexpected request ${request.path}'),
        };
        handler.resolve(Response(requestOptions: request, data: data));
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(theme: finStackTheme(), home: const InvestmentsPage()),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Infosys'));
    await tester.pumpAndSettle();

    expect(find.text('RECORD SALE'), findsOneWidget);
    expect(find.text('UPDATE VALUATION'), findsOneWidget);
  });
}
