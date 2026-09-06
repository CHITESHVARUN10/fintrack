import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

String _rs(dynamic v) {
  final n = (v as num?)?.toDouble() ?? 0;
  return '₹${n.toStringAsFixed(0)}';
}

String _idOf(Map item) => '${item['_id'] ?? item['id'] ?? ''}';

/// Mirrors website Form16List.tsx / Form16Upload.tsx / TaxRecommendation.tsx:
/// GET /form16 (list), POST /form16/upload (multipart field 'pdf'),
/// POST /form16/manual (minimal fields), GET /form16/:id/recommendation
/// (AI-quota 429 handled), DELETE /form16/:id. Tap → recommendation view.
class Form16Page extends StatefulWidget {
  const Form16Page({super.key});
  @override
  State<Form16Page> createState() => _Form16PageState();
}

class _Form16PageState extends State<Form16Page> {
  List items = [];
  bool loading = true;
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final res = await ApiClient.dio.get('/form16');
      if (!mounted) return;
      setState(() => items = (res.data as List?) ?? []);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load Form 16 records.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> uploadPdf() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom, allowedExtensions: ['pdf'], withData: true,
    );
    final file = picked?.files.firstOrNull;
    if (file == null || file.bytes == null) return;
    setState(() { busy = true; error = null; });
    try {
      final form = FormData.fromMap({
        'pdf': MultipartFile.fromBytes(file.bytes!, filename: file.name),
      });
      await ApiClient.dio.post('/form16/upload', data: form);
      await load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Form 16 uploaded — extracting…')));
      }
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => error = e.response?.statusCode == 429
          ? 'AI quota: 4 requests per 5 min — please try again shortly.'
          : 'Could not upload PDF.');
    } catch (_) {
      if (!mounted) return;
      setState(() => error = 'Could not upload PDF.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void openManualForm() {
    showModalBottomSheet(context: context, isScrollControlled: true,
      builder: (_) => _ManualForm(onSaved: () { Navigator.pop(context); load(); }));
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Delete?'),
      content: Text('Delete Form 16 "${item['employerName'] ?? item['financialYear'] ?? ''}"?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
      ],
    ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete('/form16/${_idOf(item)}');
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete Form 16.')));
    }
  }

  void openRecommendation(Map item) {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => _RecommendationScreen(id: _idOf(item)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && items.isEmpty
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Expanded(child: Text('FORM 16 RECORDS\nManage and analyze your tax documents.',
                      style: TextStyle(fontSize: 12))),
                    BrutalButton(label: busy ? '…' : '+ New', onPressed: busy ? null : openManualForm),
                  ]),
                  const SizedBox(height: 8),
                  BrutalButton(label: busy ? 'Uploading…' : 'Upload PDF', icon: Icons.upload_file,
                    onPressed: busy ? null : uploadPdf),
                  const SizedBox(height: 12),
                  if (items.isEmpty)
                    const BrutalCard(child: Text('No Form 16 records yet. Upload a PDF or add one manually.'))
                  else
                    ...items.map((rec) => Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Expanded(child: Text('${rec['employerName'] ?? '—'}',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
                          IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(rec)),
                        ]),
                        Text('${rec['employeeName'] ?? ''} · ${rec['financialYear'] ?? ''} · ${rec['taxRegimeUsed'] ?? ''} regime',
                          style: const TextStyle(fontSize: 11)),
                        const SizedBox(height: 6),
                        Row(children: [
                          Expanded(child: Text('Gross\n${_rs(rec['grossSalary'])}',
                            style: const TextStyle(fontWeight: FontWeight.w800))),
                          Expanded(child: Text('TDS\n${_rs(rec['tdsDeducted'])}',
                            style: const TextStyle(fontWeight: FontWeight.w800))),
                        ]),
                        const SizedBox(height: 8),
                        Align(alignment: Alignment.centerRight, child: BrutalButton(
                          label: 'Tax Recommendation',
                          onPressed: () => openRecommendation(Map<String, dynamic>.from(rec)),
                        )),
                      ])),
                    )),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: uploadPdf, child: const Icon(Icons.upload_file)),
    );
  }
}

class _ManualForm extends StatefulWidget {
  final VoidCallback onSaved;
  const _ManualForm({required this.onSaved});
  @override
  State<_ManualForm> createState() => _ManualFormState();
}

class _ManualFormState extends State<_ManualForm> {
  final employerCtrl = TextEditingController();
  final employeeCtrl = TextEditingController();
  final fyCtrl = TextEditingController(text: '2025-26');
  final grossCtrl = TextEditingController();
  bool busy = false;
  String? error;

  Future<void> save() async {
    setState(() { busy = true; error = null; });
    try {
      await ApiClient.dio.post('/form16/manual', data: {
        if (employerCtrl.text.trim().isNotEmpty) 'employerName': employerCtrl.text.trim(),
        if (employeeCtrl.text.trim().isNotEmpty) 'employeeName': employeeCtrl.text.trim(),
        if (fyCtrl.text.trim().isNotEmpty) 'financialYear': fyCtrl.text.trim(),
        if ((double.tryParse(grossCtrl.text.trim()) ?? 0) > 0)
          'grossSalary': double.parse(grossCtrl.text.trim()),
      });
      widget.onSaved();
    } catch (_) {
      if (!mounted) return;
      setState(() => error = 'Could not create Form 16.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('NEW FORM 16 (MANUAL)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        if (error != null) ...[const SizedBox(height: 8), Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12))],
        BrutalField(label: 'Employer name', controller: employerCtrl, hint: 'e.g. Acme Pvt Ltd'),
        const SizedBox(height: 8),
        BrutalField(label: 'Employee name', controller: employeeCtrl, hint: 'Your name'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Financial year', controller: fyCtrl, hint: '2025-26')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Gross salary ₹', controller: grossCtrl, hint: '0')),
        ]),
        const SizedBox(height: 12),
        BrutalButton(label: busy ? 'Saving…' : 'Save', onPressed: busy ? null : save),
        const SizedBox(height: 20),
      ])),
    );
  }
}

/// Same-file detail view: GET /form16/:id/recommendation.
/// Shows recommended regime + savings + per-regime tax + suggestions.
/// 429 → friendly AI-quota message (backend geminiRateLimiter: 4 req / 5 min).
class _RecommendationScreen extends StatefulWidget {
  final String id;
  const _RecommendationScreen({required this.id});
  @override
  State<_RecommendationScreen> createState() => _RecommendationScreenState();
}

class _RecommendationScreenState extends State<_RecommendationScreen> {
  Map<String, dynamic>? rec;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final res = await ApiClient.dio.get('/form16/${widget.id}/recommendation');
      if (!mounted) return;
      setState(() => rec = Map<String, dynamic>.from(res.data as Map));
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => error = e.response?.statusCode == 429
          ? 'AI quota: 4 requests per 5 min — please try again shortly.'
          : 'Could not load recommendation.');
    } catch (_) {
      if (!mounted) return;
      setState(() => error = 'Could not load recommendation.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final regimes = rec?['regimes'] as Map?;
    final suggestions = (rec?['taxSavingSuggestions'] as List?) ?? [];
    return Scaffold(
      appBar: AppBar(title: const Text('TAX RECOMMENDATION')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(16),
                  child: BrutalCard(child: Text(error!))))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Container(padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: const Color(0xFFFFE500), border: Border.all(width: 3)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${rec!['recommendedRegime'] ?? '—'} REGIME SAVES YOU MORE',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                      Text(_rs(rec!['savingsAmount']),
                        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900)),
                      if ('${rec!['explanation'] ?? ''}'.isNotEmpty)
                        Text('${rec!['explanation']}', style: const TextStyle(fontSize: 12)),
                    ])),
                  const SizedBox(height: 12),
                  for (final key in ['old', 'new'])
                    if (regimes?[key] is Map)
                      Container(margin: const EdgeInsets.only(bottom: 10), child: BrutalCard(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${(regimes![key])['regime'] ?? key} REGIME',
                            style: const TextStyle(fontWeight: FontWeight.w900)),
                          Text('Taxable: ${_rs((regimes[key])['taxableIncome'])}',
                            style: const TextStyle(fontSize: 12)),
                          Text('Tax: ${_rs((regimes[key])['finalTax'])}',
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                          if (((regimes[key])['tdsDeducted'] as num? ?? 0) > 0)
                            Text('TDS: ${_rs((regimes[key])['tdsDeducted'])}',
                              style: const TextStyle(fontSize: 12)),
                        ]),
                      )),
                  const SizedBox(height: 4),
                  const Text('TAX-SAVING SUGGESTIONS', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  if (suggestions.isEmpty)
                    const BrutalCard(child: Text('No suggestions for this record yet.'))
                  else
                    ...suggestions.map((s) => Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${s['title'] ?? s['suggestion'] ?? 'Suggestion'}',
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                        if ('${s['detail'] ?? ''}'.isNotEmpty)
                          Text('${s['detail']}', style: const TextStyle(fontSize: 12)),
                        Text('Potential saving: ${_rs(s['potentialSaving'])}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                      ])),
                    )),
                ]),
    );
  }
}
