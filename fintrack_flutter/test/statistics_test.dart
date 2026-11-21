import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/core/spending_statistics.dart';
import 'package:fintrack_flutter/features/shell.dart';
import 'package:fintrack_flutter/widgets/spending_breakdown.dart';
import 'package:fintrack_flutter/widgets/spending_trend.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('calendar comparisons handle month-end, leap years and custom days', () {
    final february = spendingRanges(
      period: SpendingPeriod.month,
      now: DateTime(2024, 2, 29, 16),
      month: DateTime(2024, 2),
    );
    expect(february.current.end, DateTime(2024, 2, 29));
    expect(february.previous.end, DateTime(2024, 1, 29));

    final march = spendingRanges(
      period: SpendingPeriod.month,
      now: DateTime(2024, 3, 30),
      month: DateTime(2024, 3),
    );
    expect(march.previous.end, DateTime(2024, 2, 29));

    final day = spendingRanges(
      period: SpendingPeriod.custom,
      now: DateTime(2024, 3, 2),
      month: DateTime(2024, 3),
      custom: DateTimeRange(
        start: DateTime(2024, 3, 1),
        end: DateTime(2024, 3, 1),
      ),
    );
    expect(day.previous.start, DateTime(2024, 2, 29));
    expect(day.previous.end, day.previous.start);

    final range = spendingRanges(
      period: SpendingPeriod.custom,
      now: DateTime(2024, 3, 2),
      month: DateTime(2024, 3),
      custom: DateTimeRange(
        start: DateTime(2024, 3, 1),
        end: DateTime(2024, 3, 5),
      ),
    );
    expect(range.previous.start, DateTime(2024, 2, 25));
    expect(range.previous.end, DateTime(2024, 2, 29));
  });

  test(
    'loads all pages, applies named vendors and filters allocated spend',
    () async {
      final ranges = spendingRanges(
        period: SpendingPeriod.month,
        now: DateTime(2024, 4, 15),
        month: DateTime(2024, 4),
      );
      final visits = <Map<String, dynamic>>[];
      mockStats((request) {
        if (request.path == '/recipients') {
          return {
            'items': [
              {'_id': 'cafe', 'upiId': 'abc@bank', 'label': 'Corner Café'},
            ],
          };
        }
        visits.add(request.queryParameters);
        final firstPage = request.queryParameters['page'] == 1;
        return {
          'hasMore': firstPage,
          'items': firstPage
              ? [
                  row(
                    'expense',
                    DateTime(2024, 4, 1),
                    12025,
                    extra: {
                      'recipientVendorRef': 'cafe',
                      'categorySplit': [
                        {'category': 'Groceries', 'amountPaise': 4500},
                      ],
                    },
                  ),
                  row(
                    'transfer',
                    DateTime(2024, 4, 8),
                    98200,
                    type: 'INTERNAL_TRANSFER',
                  ),
                  row(
                    'voided',
                    DateTime(2024, 4, 8),
                    98200,
                    extra: {'status': 'VOIDED'},
                  ),
                  row('late-march', DateTime(2024, 3, 25), 98200),
                ]
              : [
                  row(
                    'march',
                    DateTime(2024, 3, 3),
                    6000,
                    extra: {
                      'recipient': {
                        'name': 'UPI/DR/12345678/Random/HDFC/abc@bank',
                      },
                    },
                  ),
                  row(
                    'cash',
                    DateTime(2024, 4, 12),
                    1000,
                    type: 'CASH_EXPENSE',
                  ),
                ],
        };
      });

      final data = await SpendingStatistics.load(ranges, CancelToken());
      expect(visits.map((request) => request['page']), [1, 2]);
      expect(visits.first['familyView'], false);
      expect(visits.first['from'], DateTime(2024, 3).toUtc().toIso8601String());
      expect(data.options(byVendor: true), ['Corner Café', 'Corner Store']);
      final total = data.filter(range: ranges.current);
      expect(total.currentPaise, 13025);
      expect(total.previousPaise, 6000);
      expect(total.count, 2);
      expect(total.buckets[0].paise, 12025);
      expect(total.buckets[11].paise, 1000);
      final cafe = data.filter(
        range: ranges.current,
        category: 'FOOD',
        vendor: 'corner café',
      );
      expect(cafe.changes(byVendor: true), [
        (label: 'Corner Café', current: 7525, previous: 6000),
      ]);
      final groceries = data.filter(
        range: ranges.current,
        category: 'Groceries',
      );
      expect(groceries.breakdown(byVendor: false), [
        (label: 'Groceries', value: 45.0),
      ]);
      expect(groceries.previousPaise, 0);
    },
  );

  testWidgets(
    'Stats tab filters spending, switches breakdown and browses months',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final today = DateUtils.dateOnly(DateTime.now());
      final before = DateTime(today.year, today.month - 1, 1);
      mockStats((request) {
        if (request.path != '/transactions') return {'items': []};
        final start = DateTime.parse(request.queryParameters['from'] as String);
        final end = DateTime.parse(request.queryParameters['to'] as String);
        final records = [
          row('current-food', today, 18000),
          row(
            'current-travel',
            today,
            18000,
            extra: {
              'category': 'Transit',
              'recipient': {'name': 'Metro'},
            },
          ),
          row('previous-food', before, 9000),
        ];
        return {
          'items': records.where((item) {
            final date = DateTime.parse(item['occurredAt'] as String);
            return !date.isBefore(start) && !date.isAfter(end);
          }).toList(),
        };
      });

      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: Shell())),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('STATS'));
      await tester.pumpAndSettle();
      expect(find.text('STATISTICS'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(SpendingTrend),
          matching: find.text('₹360'),
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('All categories'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'food');
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.text('Food'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1 expense'), findsOneWidget);
      expect(find.text('₹90 more (100%)'), findsWidgets);
      await tester.tap(find.text('All vendors'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(BottomSheet),
          matching: find.text('Metro'),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('No spending matches these filters in this period.'),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Clear filters'));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('By vendor'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text('By vendor'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('By vendor'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<SpendingBreakdown>(find.byType(SpendingBreakdown)).title,
        'Vendor breakdown',
      );
      await tester.drag(find.byType(Scrollable).first, const Offset(0, 900));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();
      expect(find.text('1 expense'), findsOneWidget);
      await tester.tap(find.byTooltip('Next month'));
      await tester.pumpAndSettle();
      expect(find.text('2 expenses'), findsOneWidget);
      await tester.tap(find.byTooltip('Next month'));
      await tester.pumpAndSettle();
      expect(
        find.text('No spending recorded yet for this upcoming period.'),
        findsOneWidget,
      );
      expect(find.textContaining('100%)'), findsNothing);

      await tester.tap(find.text('Today'));
      await tester.pumpAndSettle();
      expect(find.text('2 expenses'), findsOneWidget);
      await tester.tap(find.text('Custom dates'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Apply dates'));
      await tester.pumpAndSettle();
      expect(find.text('Custom period'), findsOneWidget);
      expect(find.text('2 expenses'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

Map<String, dynamic> row(
  String id,
  DateTime date,
  int amount, {
  String type = 'EXPENSE',
  Map<String, dynamic> extra = const {},
}) => {
  '_id': id,
  'occurredAt': date.toUtc().toIso8601String(),
  'amountPaise': amount,
  'type': type,
  'category': 'Food',
  'recipient': {'name': 'UPI/Corner Store/HDFC/12345678'},
  ...extra,
};

void mockStats(Map<String, dynamic> Function(RequestOptions) response) {
  final interceptor = InterceptorsWrapper(
    onRequest: (request, handler) => handler.resolve(
      Response(requestOptions: request, data: response(request)),
    ),
  );
  ApiClient.dio.interceptors.add(interceptor);
  addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
}
