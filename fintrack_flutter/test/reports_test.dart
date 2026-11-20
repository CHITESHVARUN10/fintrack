import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/reports_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void mockReport(InterceptorSendCallback onRequest) {
  final interceptor = InterceptorsWrapper(onRequest: onRequest);
  ApiClient.dio.interceptors.add(interceptor);
  addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
}

void main() {
  testWidgets(
    'generated reports keep their file and expose native actions',
    (tester) async {
      final bytes = utf8.encode('%PDF-1.4');
      const name = 'monthly-report-2026-11.pdf';
      mockReport((options, handler) {
        expect(options.path, '/reports/monthly');
        expect(options.queryParameters['format'], 'pdf');
        handler.resolve(
          Response(
            requestOptions: options,
            data: bytes,
            headers: Headers.fromMap({
              'content-type': ['application/pdf'],
              'content-disposition': ['attachment; filename="$name"'],
            }),
          ),
        );
      });

      const channel = MethodChannel('finstack/report_preview');
      final messenger = tester.binding.defaultBinaryMessenger;
      final calls = <MethodCall>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return null;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));

      await tester.pumpWidget(const MaterialApp(home: ReportsPage()));
      await tester.tap(find.text('Generate').first);
      await tester.pumpAndSettle();

      expect(find.text(name), findsOneWidget);
      expect(find.text('Share or save'), findsOneWidget);
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(calls.single.method, 'preview');
      expect(calls.single.arguments['name'], name);
      expect(calls.single.arguments['bytes'], bytes);
      expect(find.text(name), findsOneWidget);
    },
    variant: const TargetPlatformVariant({TargetPlatform.iOS}),
  );

  testWidgets('a JSON error returned as bytes never becomes an export', (
    tester,
  ) async {
    mockReport((options, handler) {
      handler.reject(
        DioException.badResponse(
          statusCode: 400,
          requestOptions: options,
          response: Response(
            statusCode: 400,
            requestOptions: options,
            data: utf8.encode('{"error":"Invalid report dates"}'),
          ),
        ),
      );
    });

    await tester.pumpWidget(const MaterialApp(home: ReportsPage()));
    await tester.tap(find.text('Generate').first);
    await tester.pumpAndSettle();
    expect(find.text('Invalid report dates'), findsOneWidget);
    expect(find.text('Share or save'), findsNothing);
  });

  testWidgets('Excel export sends the workbook file to the share sheet', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    const name = 'monthly-report-2026-11.xlsx';
    const mime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    final bytes = [80, 75, 3, 4];
    mockReport((options, handler) {
      expect(options.queryParameters['format'], 'excel');
      handler.resolve(
        Response(
          requestOptions: options,
          data: bytes,
          headers: Headers.fromMap({
            'content-type': [mime],
            'content-disposition': ['attachment; filename="$name"'],
          }),
        ),
      );
    });
    final temporary = Directory.systemTemp.createTempSync(
      'finstack-report-test-',
    );
    addTearDown(() => temporary.deleteSync(recursive: true));
    const pathChannel = MethodChannel('plugins.flutter.io/path_provider');
    const shareChannel = MethodChannel('dev.fluttercommunity.plus/share');
    final messenger = tester.binding.defaultBinaryMessenger;
    addTearDown(() {
      messenger.setMockMethodCallHandler(pathChannel, null);
      messenger.setMockMethodCallHandler(shareChannel, null);
    });

    await tester.pumpWidget(const MaterialApp(home: ReportsPage()));
    await tester.tap(find.text('PDF'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('EXCEL').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate').first);
    await tester.pumpAndSettle();
    expect(find.text(name), findsOneWidget);
    await tester.runAsync(() async {
      final shareCall = Completer<MethodCall>();
      messenger.setMockMethodCallHandler(
        pathChannel,
        (_) async => temporary.path,
      );
      messenger.setMockMethodCallHandler(shareChannel, (call) async {
        shareCall.complete(call);
        return '';
      });
      await tester.tap(find.text('Share or save'));
      final call = await shareCall.future.timeout(const Duration(seconds: 3));
      final arguments = call.arguments as Map;
      final paths = arguments['paths'] as List;
      final file = File(paths.single as String);
      expect(file.uri.pathSegments.last, name);
      expect(await file.readAsBytes(), bytes);
      expect(arguments['mimeTypes'], [mime]);
      expect(arguments['originWidth'], greaterThan(0));
    });
    await tester.pumpAndSettle();
    expect(find.text('Share or save'), findsOneWidget);
  });
}
