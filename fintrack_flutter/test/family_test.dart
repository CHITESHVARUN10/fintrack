import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/family_page.dart';
import 'package:fintrack_flutter/theme/finstack_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('members see their household without requesting admin data', (
    tester,
  ) async {
    final requests = <String>[];
    final interceptor = InterceptorsWrapper(
      onRequest: (request, handler) {
        requests.add(request.path);
        final data = switch (request.path) {
          '/families/me' => {
            'family': {'_id': 'household', 'name': 'Rao Household'},
            'membership': {'role': 'MEMBER'},
          },
          '/families/household/members' => {
            'members': [
              {'name': 'Avery Rao', 'membershipRole': 'MEMBER'},
            ],
          },
          _ => throw StateError('Unexpected request ${request.path}'),
        };
        handler.resolve(Response(requestOptions: request, data: data));
      },
    );
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

    await tester.pumpWidget(
      MaterialApp(
        theme: finStackTheme(),
        home: const FamilyPage(showHeader: true),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Rao Household'), findsOneWidget);
    expect(find.text('Avery Rao'), findsOneWidget);
    expect(find.byTooltip('Rotate invite code'), findsNothing);
    expect(requests, ['/families/me', '/families/household/members']);
  });
}
