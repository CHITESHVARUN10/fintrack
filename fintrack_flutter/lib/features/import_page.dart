import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

class ImportPageWidget extends StatefulWidget {
  const ImportPageWidget({super.key});
  @override
  State<ImportPageWidget> createState() => _ImportPageWidgetState();
}

class _ImportPageWidgetState extends State<ImportPageWidget> {
  bool bankBusy = false;
  bool shotBusy = false;
  String? bankResult;
  String? shotResult;
  String? bankError;
  String? shotError;

  String _describe(Map data) {
    final status = '${data['status'] ?? ''}';
    if (status == 'duplicate_file') {
      return 'DUPLICATE — ${data['message'] ?? 'This file was already imported.'}';
    }
    final summary = data['summary'];
    if (summary is Map) {
      return 'Imported — ${summary['created'] ?? 0} created, '
          '${summary['reconciled'] ?? 0} reconciled, '
          '${summary['pendingReview'] ?? 0} pending review.';
    }
    return status.isEmpty ? 'Upload complete.' : status.replaceAll('_', ' ').toUpperCase();
  }

  Future<void> pickBank() async {
    if (bankBusy) return;
    setState(() {
      bankBusy = true;
      bankError = null;
      bankResult = null;
    });
    try {
      final res = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv', 'xlsx', 'xls'],
        withData: true,
      );
      if (res == null || res.files.first.bytes == null) return;
      final f = res.files.first;
      final fd = FormData.fromMap({
        'file': MultipartFile.fromBytes(f.bytes!, filename: f.name),
      });
      final r = await ApiClient.dio.post('/imports/bank', data: fd);
      if (!mounted) return;
      final data = r.data is Map ? Map<String, dynamic>.from(r.data as Map) : <String, dynamic>{};
      setState(() => bankResult = _describe(data));
    } on DioException catch (e) {
      final detail = e.response?.data is Map ? '${(e.response!.data as Map)['error'] ?? ''}' : '';
      if (mounted) {
        setState(() => bankError = detail.isEmpty
            ? 'Upload failed. Check your connection and file type.'
            : detail);
      }
    } catch (_) {
      if (mounted) {
        setState(() => bankError = 'Could not read that file. Try another CSV or Excel export.');
      }
    } finally {
      if (mounted) setState(() => bankBusy = false);
    }
  }

  Future<void> pickScreenshot() async {
    if (shotBusy) return;
    setState(() {
      shotBusy = true;
      shotError = null;
      shotResult = null;
    });
    try {
      final picker = ImagePicker();
      final x = await picker.pickImage(source: ImageSource.gallery);
      if (x == null) return;
      final bytes = await x.readAsBytes();
      final fd = FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: x.name),
      });
      final r = await ApiClient.dio.post('/imports/screenshot', data: fd);
      if (!mounted) return;
      final data = r.data is Map ? Map<String, dynamic>.from(r.data as Map) : <String, dynamic>{};
      setState(() => shotResult = _describe(data));
    } on DioException catch (e) {
      final detail = e.response?.data is Map ? '${(e.response!.data as Map)['error'] ?? ''}' : '';
      if (mounted) {
        setState(() => shotError = detail.isEmpty
            ? 'Could not extract the screenshot. Check your connection and retry.'
            : detail);
      }
    } catch (_) {
      if (mounted) {
        setState(() => shotError = 'Could not read the screenshot. Check the photo permission and retry.');
      }
    } finally {
      if (mounted) setState(() => shotBusy = false);
    }
  }

  Widget _resultBox(String? result, String? error) {
    if (result == null && error == null) return const SizedBox.shrink();
    final isError = error != null;
    final text = error ?? result ?? '';
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isError ? FinStackColors.errorContainer : FinStackColors.surfaceContainer,
        border: Border.all(width: 2, color: FinStackColors.onSurface),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: isError ? FinStackColors.onErrorContainer : FinStackColors.onSurface,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      BrutalCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('BANK STATEMENT',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
          const Text('Upload CSV or Excel (.xlsx). Re-uploads are deduplicated.',
              style: TextStyle(fontSize: 12, color: FinStackColors.onSurfaceVariant)),
          const SizedBox(height: 8),
          BrutalButton(
            label: bankBusy ? 'Uploading…' : 'Pick File',
            icon: Icons.upload_file,
            onPressed: bankBusy ? null : pickBank,
          ),
          _resultBox(bankResult, bankError),
        ]),
      ),
      const SizedBox(height: 12),
      BrutalCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('UPI SCREENSHOT',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
          const Text('Gemini extracts amount/date/UPI from the image.',
              style: TextStyle(fontSize: 12, color: FinStackColors.onSurfaceVariant)),
          const SizedBox(height: 8),
          BrutalButton(
            label: shotBusy ? 'Reading…' : 'Pick Image',
            icon: Icons.image,
            onPressed: shotBusy ? null : pickScreenshot,
          ),
          _resultBox(shotResult, shotError),
        ]),
      ),
      const SizedBox(height: 12),
      const BrutalCard(
        child: Text(
          'Tip: imports need a family. Create or join one from Profile before uploading.',
          style: TextStyle(fontSize: 11),
        ),
      ),
    ]);
  }
}
