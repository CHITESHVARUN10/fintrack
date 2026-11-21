import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../core/bank_import.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/workspace.dart';

class ImportPageWidget extends StatefulWidget {
  const ImportPageWidget({super.key, required this.bankImport});

  final BankImport bankImport;
  @override
  State<ImportPageWidget> createState() => _ImportPageWidgetState();
}

class _ImportPageWidgetState extends State<ImportPageWidget> {
  bool shotBusy = false;
  String? shotResult;
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
    return status.isEmpty
        ? 'Upload complete.'
        : status.replaceAll('_', ' ').toUpperCase();
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
      final data = r.data is Map
          ? Map<String, dynamic>.from(r.data as Map)
          : <String, dynamic>{};
      setState(() => shotResult = _describe(data));
    } on DioException catch (e) {
      final detail = e.response?.data is Map
          ? '${(e.response!.data as Map)['error'] ?? ''}'
          : '';
      if (mounted) {
        setState(
          () => shotError = detail.isEmpty
              ? 'Could not extract the screenshot. Check your connection and retry.'
              : detail,
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => shotError =
              'Could not read the screenshot. Check the photo permission and retry.',
        );
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
        color: isError
            ? FinStackColors.errorContainer
            : FinStackColors.surfaceContainer,
        border: Border.all(width: 2, color: FinStackColors.onSurface),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: isError
              ? FinStackColors.onErrorContainer
              : FinStackColors.onSurface,
        ),
      ),
    );
  }

  Widget _bankCard(BankImport bank) {
    final progress = switch (bank.stage) {
      BankImportStage.choosing => 'Choosing a statement…',
      BankImportStage.uploading => 'Uploading statement…',
      BankImportStage.processing => 'Processing transactions…',
      BankImportStage.checking => 'Checking import history…',
      BankImportStage.idle => null,
    };
    return BrutalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: const Text(
              'Bank statement',
              style: TextStyle(
                fontFamily: FinStackType.display,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Import a CSV or Excel statement.',
            style: TextStyle(color: FinStackColors.onSurfaceVariant),
          ),
          if (bank.fileName != null) ...[
            const SizedBox(height: 12),
            Text(
              bank.fileName!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
          const SizedBox(height: 12),
          if (progress != null) ...[
            Semantics(
              liveRegion: true,
              child: Text(
                progress,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 8),
            const LinearProgressIndicator(),
            if (bank.stage == BankImportStage.processing) ...[
              const SizedBox(height: 8),
              const Text(
                'You can switch tabs while FinStack imports the rows.',
              ),
            ],
          ] else ...[
            if (bank.title != null) ...[
              Semantics(
                liveRegion: true,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: bank.hasError
                        ? FinStackColors.errorContainer
                        : FinStackColors.surfaceContainer,
                    border: Border.all(
                      color: FinStackColors.onSurface,
                      width: 2,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        bank.title!,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      if (bank.detail != null) ...[
                        const SizedBox(height: 4),
                        Text(bank.detail!),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (bank.canCheck) ...[
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(48, 48),
                ),
                onPressed: bank.checkStatus,
                child: const Text('Check import status'),
              ),
              const SizedBox(height: 8),
            ],
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(48, 48),
                backgroundColor: bank.canCheck
                    ? Colors.white
                    : FinStackColors.brandYellow,
              ),
              onPressed: bank.pickFile,
              icon: const Icon(Icons.upload_file),
              label: Text(
                bank.fileName == null
                    ? 'Choose statement'
                    : 'Choose another statement',
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return WorkspaceScaffold(
      title: 'Import',
      action: const BrutalTag(
        label: 'CSV / AI',
        color: FinStackColors.surfaceContainer,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
        children: [
          ListenableBuilder(
            listenable: widget.bankImport,
            builder: (context, _) => _bankCard(widget.bankImport),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('UPI SCREENSHOT', style: FinStackType.caption),
                const Text(
                  'Extract the amount, date, and UPI details from a screenshot.',
                  style: TextStyle(
                    fontSize: 12,
                    color: FinStackColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 8),
                BrutalButton(
                  label: shotBusy ? 'Reading…' : 'Pick Image',
                  icon: Icons.image,
                  onPressed: shotBusy ? null : pickScreenshot,
                ),
                _resultBox(shotResult, shotError),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const BrutalCard(
            color: FinStackColors.surfaceContainer,
            child: Text(
              'Tip: imports need a family. Create or join one from Profile before uploading.',
              style: TextStyle(fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}
