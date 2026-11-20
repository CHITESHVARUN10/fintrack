import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

/// Generates PDF and Excel reports and hands them to the platform.
class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportDef {
  final String kind;
  final String title;
  final String desc;
  const _ReportDef(this.kind, this.title, this.desc);
}

class _ReportFile {
  final String name;
  final String mimeType;
  final Uint8List bytes;
  const _ReportFile(this.name, this.mimeType, this.bytes);
}

const _reportKinds = [
  _ReportDef(
    'monthly',
    'Monthly Summary',
    'Income, obligations & expenses for one month.',
  ),
  _ReportDef(
    'annual',
    'Annual Summary',
    'Full-year income, obligations & trends.',
  ),
  _ReportDef(
    'category',
    'Category Breakdown',
    'Spending by category over a date range.',
  ),
  _ReportDef(
    'tax',
    'Tax Summary',
    'Deductions, liabilities & regime pick (PDF only).',
  ),
  _ReportDef(
    'family',
    'Family Report',
    'Unified ledger: member/category/vendor/mode shares.',
  ),
];

class _ReportsPageState extends State<ReportsPage> {
  late final TextEditingController monthCtrl;
  late final TextEditingController yearCtrl;
  late final TextEditingController fromCtrl;
  late final TextEditingController toCtrl;
  String format = 'pdf';
  static const _previewChannel = MethodChannel('finstack/report_preview');
  final Map<String, String> status = {};
  final Map<String, _ReportFile> _files = {};
  bool _opening = false;

  bool get _supportsPreview =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
  final Set<String> busy = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    monthCtrl = TextEditingController(text: '${now.month}');
    yearCtrl = TextEditingController(text: '${now.year}');
    fromCtrl = TextEditingController(
      text: '${now.year}-${now.month.toString().padLeft(2, '0')}-01',
    );
    toCtrl = TextEditingController(
      text: '${now.year}-${now.month.toString().padLeft(2, '0')}-28',
    );
  }

  @override
  void dispose() {
    monthCtrl.dispose();
    yearCtrl.dispose();
    fromCtrl.dispose();
    toCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> _paramsFor(String kind) {
    final year = int.tryParse(yearCtrl.text.trim()) ?? DateTime.now().year;
    switch (kind) {
      case 'monthly':
        return {
          'month': int.tryParse(monthCtrl.text.trim()) ?? DateTime.now().month,
          'year': year,
        };
      case 'annual':
      case 'tax':
        return {'year': year};
      case 'category':
      case 'family':
        return {'from': fromCtrl.text.trim(), 'to': toCtrl.text.trim()};
      default:
        return {};
    }
  }

  Future<void> generate(String kind) async {
    if (busy.contains(kind)) return;
    dismissKeyboard(context);
    final params = _paramsFor(kind);
    final excel = kind != 'tax' && format == 'excel';
    final extension = excel ? 'xlsx' : 'pdf';
    final mimeType = excel
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
    setState(() {
      busy.add(kind);
      status.remove(kind);
      _files.remove(kind);
    });
    try {
      final res = await ApiClient.dio.get<List<int>>(
        '/reports/$kind',
        queryParameters: {...params, 'format': excel ? 'excel' : 'pdf'},
        options: Options(responseType: ResponseType.bytes),
      );
      if (!mounted) return;
      final bytes = res.data;
      final contentType = res.headers
          .value('content-type')
          ?.split(';')
          .first
          .trim();
      if (bytes == null || bytes.isEmpty || contentType != mimeType) {
        setState(() => status[kind] = _reportError(bytes));
        return;
      }
      final suppliedName = RegExp(
        r'filename="([^"]+)"',
        caseSensitive: false,
      ).firstMatch(res.headers.value('content-disposition') ?? '')?.group(1);
      final name =
          suppliedName != null &&
              RegExp(
                r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$',
              ).hasMatch(suppliedName) &&
              suppliedName.toLowerCase().endsWith('.$extension')
          ? suppliedName
          : 'finstack-$kind-report.$extension';
      setState(
        () => _files[kind] = _ReportFile(
          name,
          mimeType,
          Uint8List.fromList(bytes),
        ),
      );
    } on DioException catch (error) {
      if (mounted) {
        setState(() => status[kind] = _reportError(error.response?.data));
      }
    } catch (_) {
      if (mounted) setState(() => status[kind] = _reportError(null));
    } finally {
      if (mounted) setState(() => busy.remove(kind));
    }
  }

  String _reportError(Object? response) {
    try {
      final data = response is List<int>
          ? jsonDecode(utf8.decode(response))
          : response;
      if (data is Map && data['error'] is String) {
        return data['error'] as String;
      }
    } on FormatException {
      // The server may return a plain-text or HTML error.
    }
    return 'Could not generate the report. Check the dates and try again.';
  }

  Future<void> _openReport(
    BuildContext buttonContext,
    _ReportFile file, {
    bool preview = false,
  }) async {
    if (_opening) return;
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    setState(() => _opening = true);
    try {
      if (preview) {
        await _previewChannel.invokeMethod<void>('preview', {
          'name': file.name,
          'bytes': file.bytes,
        });
      } else {
        await SharePlus.instance.share(
          ShareParams(
            files: [XFile.fromData(file.bytes, mimeType: file.mimeType)],
            fileNameOverrides: [file.name],
            sharePositionOrigin: origin,
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              preview
                  ? 'Could not preview this file. You can still share or save it.'
                  : 'Could not open sharing. Try sharing the report again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Widget _reportCard(_ReportDef report) {
    final file = _files[report.kind];
    final generating = busy.contains(report.kind);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: BrutalCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              report.title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
            ),
            Text(report.desc, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 10),
            if (generating) ...[
              const LinearProgressIndicator(
                semanticsLabel: 'Generating report',
              ),
              const SizedBox(height: 8),
              const Text('Generating report…'),
            ] else ...[
              if (status[report.kind] case final message?) ...[
                Semantics(liveRegion: true, child: Text(message)),
                const SizedBox(height: 8),
              ],
              if (file != null) ...[
                Semantics(
                  liveRegion: true,
                  child: Text(
                    file.name,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (file != null) ...[
                    Builder(
                      builder: (buttonContext) => OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(48, 48),
                          backgroundColor: FinStackColors.brandYellow,
                        ),
                        onPressed: _opening
                            ? null
                            : () => _openReport(buttonContext, file),
                        icon: const Icon(Icons.ios_share, size: 18),
                        label: const Text('Share or save'),
                      ),
                    ),
                    if (_supportsPreview)
                      Builder(
                        builder: (buttonContext) => OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(48, 48),
                          ),
                          onPressed: _opening
                              ? null
                              : () => _openReport(
                                  buttonContext,
                                  file,
                                  preview: true,
                                ),
                          child: const Text('Preview'),
                        ),
                      ),
                  ],
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      backgroundColor: file == null
                          ? FinStackColors.brandYellow
                          : Colors.white,
                    ),
                    onPressed: _opening ? null : () => generate(report.kind),
                    child: Text(file == null ? 'Generate' : 'Regenerate'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Choose a report and generate a PDF or Excel file to share or save.',
            style: TextStyle(fontSize: 12),
          ),
          const SizedBox(height: 12),
          BrutalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'MONTH / YEAR',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: BrutalField(
                        label: 'Month (1-12)',
                        controller: monthCtrl,
                        hint: '4',
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: BrutalField(
                        label: 'Year',
                        controller: yearCtrl,
                        hint: '2026',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: BrutalField(
                        label: 'From (YYYY-MM-DD)',
                        controller: fromCtrl,
                        hint: '2026-04-01',
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: BrutalField(
                        label: 'To (YYYY-MM-DD)',
                        controller: toCtrl,
                        hint: '2026-04-30',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Text(
                      'FORMAT  ',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    DropdownButton<String>(
                      value: format,
                      items: const ['pdf', 'excel']
                          .map(
                            (f) => DropdownMenuItem(
                              value: f,
                              child: Text(f.toUpperCase()),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setState(() => format = v!),
                    ),
                  ],
                ),
                const Text(
                  'Monthly uses month and year. Annual and Tax use year. Category and Family use the date range.',
                  style: TextStyle(fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ..._reportKinds.map(_reportCard),
        ],
      ),
    );
  }
}
