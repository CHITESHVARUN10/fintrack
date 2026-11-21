import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:fintrack_flutter/core/api_client.dart';
import 'package:fintrack_flutter/features/shell.dart';
import 'package:fintrack_flutter/widgets/brutal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

final _statement = Uint8List.fromList([1, 2, 3]);

class _StatementPicker extends FilePicker {
  @override
  Future<FilePickerResult?> pickFiles({
    String? dialogTitle,
    String? initialDirectory,
    FileType type = FileType.any,
    List<String>? allowedExtensions,
    Function(FilePickerStatus)? onFileLoading,
    bool allowCompression = false,
    int compressionQuality = 0,
    bool allowMultiple = false,
    bool withData = false,
    bool withReadStream = false,
    bool lockParentWindow = false,
    bool readSequential = false,
  }) async => FilePickerResult([
    PlatformFile(
      name: 'statement.xlsx',
      size: _statement.length,
      bytes: _statement,
    ),
  ]);
}

void main() {
  setUpAll(() => FilePicker.platform = _StatementPicker());
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<void> openImport(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: Shell())),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('PROFILE'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Import'));
    await tester.tap(find.text('Import'));
    await tester.pumpAndSettle();
    expect(find.text('IMPORT'), findsOneWidget);
  }

  void mockApi(void Function(RequestOptions, RequestInterceptorHandler) route) {
    final interceptor = InterceptorsWrapper(onRequest: route);
    ApiClient.dio.interceptors.add(interceptor);
    addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
  }

  void resolve(
    RequestOptions request,
    RequestInterceptorHandler handler,
    Map<String, dynamic> data,
  ) => handler.resolve(Response(requestOptions: request, data: data));

  testWidgets('Import stays in the shell and keeps its result after Back', (
    tester,
  ) async {
    late RequestOptions upload;
    late RequestInterceptorHandler result;
    var activityRequests = 0;
    mockApi((request, handler) {
      if (request.path == '/imports/bank') {
        upload = request;
        result = handler;
        return;
      }
      if (request.path == '/transactions') activityRequests++;
      resolve(request, handler, {'items': [], 'total': 0});
    });

    await openImport(tester);
    expect(find.byType(BrutalBottomNav), findsOneWidget);
    await tester.tap(find.text('Choose statement'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Uploading statement…'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 100));
    upload.onSendProgress!(10, 10);
    await tester.pump();
    expect(find.text('Processing transactions…'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Import'), findsOneWidget);

    await tester.tap(find.text('ACTIVITY'));
    await tester.pumpAndSettle();
    expect(activityRequests, 1);
    resolve(upload, result, {
      'status': 'success',
      'summary': {'created': 4, 'reconciled': 2, 'deduped': 1},
    });
    await tester.pumpAndSettle();
    expect(activityRequests, 2);
    expect(find.text('Import complete'), findsOneWidget);

    await tester.tap(find.text('PROFILE'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Import'));
    await tester.tap(find.text('Import'));
    await tester.pumpAndSettle();
    expect(
      find.text('4 added · 2 matched · 1 duplicates skipped'),
      findsOneWidget,
    );

    await tester.tap(find.text('PROFILE'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    expect(find.byType(BrutalBottomNav), findsOneWidget);
    expect(find.text('SETTINGS'), findsOneWidget);
  });

  testWidgets('A lost response is recovered from the matching import batch', (
    tester,
  ) async {
    var uploads = 0;
    mockApi((request, handler) {
      if (request.path == '/imports/bank') {
        uploads++;
        request.onSendProgress!(10, 10);
        handler.reject(
          DioException(
            requestOptions: request,
            type: DioExceptionType.receiveTimeout,
          ),
        );
        return;
      }
      if (request.path == '/imports/history') {
        resolve(request, handler, {
          'batches': [
            {
              'source': 'BANK_STATEMENT',
              'fileHash': 'another file',
              'status': 'success',
              'created': 90,
            },
            {
              'source': 'BANK_STATEMENT',
              'fileHash': sha256.convert(_statement).toString(),
              'status': 'partial',
              'createdAt': DateTime.now().toUtc().toIso8601String(),
              'created': 3,
              'failed': 2,
            },
          ],
        });
        return;
      }
      resolve(request, handler, {});
    });

    await openImport(tester);
    await tester.tap(find.text('Choose statement'));
    await tester.pumpAndSettle();
    expect(find.text('Import partially complete'), findsOneWidget);
    expect(find.text('3 added · 0 matched · 2 failed'), findsOneWidget);
    expect(uploads, 1);
  });

  testWidgets('An imported statement opens its month for one Activity visit', (
    tester,
  ) async {
    final today = DateUtils.dateOnly(DateTime.now());
    final month = DateTime(today.year, today.month - 1);
    final lastDay = DateTime(today.year, today.month, 0);
    final ranges = <Map<String, dynamic>>[];
    mockApi((request, handler) {
      if (request.path == '/imports/bank') {
        resolve(request, handler, {
          'status': 'success',
          'periodFrom': month.add(const Duration(days: 2)).toIso8601String(),
          'periodTo': lastDay
              .subtract(const Duration(days: 2))
              .toIso8601String(),
          'summary': {'created': 4},
        });
        return;
      }
      if (request.path == '/transactions') ranges.add(request.queryParameters);
      resolve(request, handler, {'items': [], 'total': 0});
    });

    await openImport(tester);
    await tester.tap(find.text('Choose statement'));
    await tester.pumpAndSettle();
    expect(find.text('Import complete'), findsOneWidget);
    expect(find.text('IMPORT'), findsNothing);
    expect(DateTime.parse(ranges.single['from'] as String).toLocal(), month);
    expect(
      DateTime.parse(ranges.single['to'] as String).toLocal(),
      DateTime(
        today.year,
        today.month,
      ).subtract(const Duration(milliseconds: 1)),
    );

    await tester.tap(find.text('HOME'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ACTIVITY'));
    await tester.pumpAndSettle();
    expect(
      DateTime.parse(ranges.last['from'] as String).toLocal(),
      DateTime(today.year, today.month),
    );
    expect(
      DateTime.parse(ranges.last['to'] as String).toLocal(),
      DateTime(
        today.year,
        today.month,
        today.day + 1,
      ).subtract(const Duration(milliseconds: 1)),
    );
  });
}
