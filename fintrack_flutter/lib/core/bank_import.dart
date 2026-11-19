import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'api_client.dart';

enum BankImportStage { idle, choosing, uploading, processing, checking }

class BankImport extends ChangeNotifier {
  BankImport({required this.onLedgerChanged});

  final ValueChanged<String> onLedgerChanged;
  BankImportStage stage = BankImportStage.idle;
  String? fileName;
  String? title;
  String? detail;
  bool hasError = false;
  bool canCheck = false;

  String? _hash;
  DateTime? _startedAt;
  final _lifetime = CancelToken();

  bool get busy => stage != BankImportStage.idle;

  @override
  void dispose() {
    _lifetime.cancel();
    super.dispose();
  }

  void _setStage(BankImportStage value) {
    stage = value;
    if (!_lifetime.isCancelled) notifyListeners();
  }

  Future<void> pickFile() async {
    if (busy) return;
    _setStage(BankImportStage.choosing);
    try {
      final selection = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv', 'xlsx', 'xls'],
        withData: true,
      );
      if (selection == null ||
          selection.files.isEmpty ||
          _lifetime.isCancelled) {
        return;
      }
      final file = selection.files.first;
      final bytes = file.bytes;
      fileName = file.name;
      title = null;
      detail = null;
      hasError = false;
      canCheck = false;
      _hash = null;
      if (bytes == null || bytes.isEmpty) {
        _failure('Choose a CSV or Excel file with transactions.');
        return;
      }
      if (bytes.length > 15 * 1024 * 1024) {
        _failure('The file is larger than 15 MB. Choose a smaller statement.');
        return;
      }
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: file.name),
      });
      _hash = sha256.convert(bytes).toString();
      _startedAt = DateTime.now();
      _setStage(BankImportStage.uploading);
      final response = await ApiClient.dio.post(
        '/imports/bank',
        data: form,
        cancelToken: _lifetime,
        options: Options(
          sendTimeout: const Duration(minutes: 2),
          receiveTimeout: const Duration(minutes: 2),
        ),
        onSendProgress: (sent, total) {
          if (total > 0 &&
              sent >= total &&
              stage == BankImportStage.uploading) {
            _setStage(BankImportStage.processing);
          }
        },
      );
      if (!_lifetime.isCancelled) {
        final data = response.data;
        if (data is! Map || !_applyResult(data)) await _recover();
      }
    } on DioException catch (error) {
      if (_lifetime.isCancelled) return;
      final code = error.response?.statusCode;
      if (error.type == DioExceptionType.receiveTimeout ||
          (code != null && code >= 500) ||
          (stage == BankImportStage.processing && code == null)) {
        await _recover();
      } else {
        final data = error.response?.data;
        _failure(
          data is Map && data['error'] is String
              ? data['error'] as String
              : 'Check your connection and choose the file again.',
        );
      }
    } catch (_) {
      if (!_lifetime.isCancelled) {
        if (stage == BankImportStage.processing) {
          await _recover();
        } else {
          _failure('Could not read the file. Try another CSV or Excel export.');
        }
      }
    } finally {
      _setStage(BankImportStage.idle);
    }
  }

  Future<void> checkStatus() async {
    if (busy || !canCheck) return;
    try {
      await _recover();
    } finally {
      _setStage(BankImportStage.idle);
    }
  }

  Future<void> _recover() async {
    _setStage(BankImportStage.checking);
    for (var attempt = 0; attempt < 3 && !_lifetime.isCancelled; attempt++) {
      if (attempt > 0) await Future<void>.delayed(const Duration(seconds: 5));
      if (_lifetime.isCancelled) return;
      try {
        final response = await ApiClient.dio.get(
          '/imports/history',
          options: Options(
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
          ),
          cancelToken: _lifetime,
        );
        if (_lifetime.isCancelled) return;
        final data = response.data;
        final batches = data is Map ? data['batches'] : null;
        if (batches is! List) continue;
        for (final batch in batches.whereType<Map>()) {
          if (batch['source'] != 'BANK_STATEMENT' ||
              batch['fileHash'] != _hash) {
            continue;
          }
          final created = DateTime.tryParse('${batch['createdAt']}');
          final recent =
              created != null &&
              !created.isBefore(
                _startedAt!.subtract(const Duration(minutes: 2)),
              );
          if ((recent || batch['status'] == 'success') && _applyResult(batch)) {
            return;
          }
        }
      } on DioException catch (error) {
        if (error.response?.statusCode == 401) break;
      }
    }
    if (_lifetime.isCancelled) return;
    title = 'Import status unavailable';
    detail =
        'The server may still be processing this file. Check its status again before uploading it again.';
    hasError = false;
    canCheck = true;
  }

  bool _applyResult(Map data) {
    final status = data['status'];
    final summary = data['summary'] is Map ? data['summary'] as Map : data;
    switch (status) {
      case 'success':
      case 'partial':
        title = status == 'success'
            ? 'Import complete'
            : 'Import partially complete';
        detail = [
          '${summary['created'] ?? 0} added',
          '${summary['reconciled'] ?? 0} matched',
          if ((summary['pendingReview'] as num? ?? 0) > 0)
            "${summary['pendingReview']} need review",
          if ((summary['deduped'] as num? ?? 0) > 0)
            "${summary['deduped']} duplicates skipped",
          if ((summary['failed'] as num? ?? 0) > 0)
            "${summary['failed']} failed",
        ].join(' · ');
      case 'duplicate_file':
        title = 'Already imported';
        detail =
            data['message'] as String? ?? 'This file was already imported.';
      case 'failed':
        _failure(
          data['message'] as String? ??
              'No transactions could be imported. Check the statement format and try again.',
        );
        return true;
      default:
        return false;
    }
    hasError = false;
    canCheck = false;
    onLedgerChanged(title!);
    return true;
  }

  void _failure(String message) {
    title = 'Import failed';
    detail = message;
    hasError = true;
    canCheck = false;
  }
}
