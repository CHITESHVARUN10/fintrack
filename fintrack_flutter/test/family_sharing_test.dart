import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/family_sharing_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('months stay private until the member shares them', (
    tester,
  ) async {
    final requests = <RequestOptions>[];
    final interceptor = InterceptorsWrapper(
      onRequest: (options, handler) {
        requests.add(options);
        if (options.method == 'GET') {
          handler.resolve(
            Response(
              requestOptions: options,
              data: {
                'months': [
                  {
                    'month': '2026-11',
                    'shared': false,
                    'count': 12,
                    'privateCount': 2,
                  },
                  {
                    'month': '2026-10',
                    'shared': true,
                    'count': 8,
                    'privateCount': 0,
                  },
                ],
              },
            ),
          );
          return;
        }
        handler.resolve(
          Response(
            requestOptions: options,
            data: {'month': '2026-11', 'shared': true},
          ),
        );
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const Scaffold(body: FamilySharingPage()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('November 2026'), findsOneWidget);
    expect(find.text('12 transactions · 2 private'), findsOneWidget);
    expect(find.text('SHARED WITH FAMILY'), findsOneWidget);
    final switches = tester.widgetList<Switch>(find.byType(Switch)).toList();
    expect(switches[0].value, isFalse);
    expect(switches[1].value, isTrue);

    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();

    final put = requests.singleWhere((request) => request.method == 'PUT');
    expect(put.path, '/families/me/sharing/2026-11');
    expect(put.data, {'shared': true});
    expect(
      tester.widgetList<Switch>(find.byType(Switch)).first.value,
      isTrue,
    );
  });
}
