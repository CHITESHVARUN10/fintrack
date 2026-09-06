import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _categories = ['School', 'College', 'Coaching', 'Online Course', 'Other'];
const _frequencies = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-time'];

String _date10(dynamic v) {
  final s = '$v';
  return s.length >= 10 ? s.substring(0, 10) : '';
}

/// Mirrors website Education.tsx: GET/POST/PUT/DELETE /education with the same fields.
class EducationPage extends StatefulWidget {
  const EducationPage({super.key});
  @override
  State<EducationPage> createState() => _EducationPageState();
}

class _EducationPageState extends State<EducationPage> {
  List items = [];
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
      final res = await ApiClient.dio.get('/education');
      setState(() => items = (res.data as List?) ?? []);
    } catch (e) {
      setState(() => error = 'Could not load education.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Delete?'),
      content: Text('Delete "${item['title']}"?'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete'))],
    ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/education/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete payment.')));
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _EducationForm(
      initial: initial,
      onSaved: () { Navigator.pop(context); load(); },
    ));
  }

  @override
  Widget build(BuildContext context) {
    final total = items.fold<double>(0, (s, e) => s + ((e['amount'] as num?)?.toDouble() ?? 0));
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Expanded(child: Text('EDUCATION\nSchool, college, coaching & course fees.', style: TextStyle(fontSize: 12))),
                    BrutalButton(label: '+ Add', onPressed: () => openForm()),
                  ]),
                  const SizedBox(height: 12),
                  if (items.isEmpty) const BrutalCard(child: Text('No education payments yet. Tap + Add to create one.'))
                  else ...items.map((edu) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${edu['title'] ?? ''}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                          if ((edu['institution'] ?? '') != '') Text('${edu['institution']}', style: const TextStyle(fontSize: 11)),
                        ])),
                        Row(children: [
                          IconButton(icon: const Icon(Icons.edit, size: 18), onPressed: () => openForm(initial: Map<String, dynamic>.from(edu))),
                          IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(edu)),
                        ]),
                      ]),
                      const SizedBox(height: 4),
                      Row(children: [
                        Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(border: Border.all(width: 2)),
                          child: Text('${edu['category'] ?? 'Other'}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                        const SizedBox(width: 6),
                        Text('${edu['frequency'] ?? ''}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                      ]),
                      const SizedBox(height: 6),
                      Text('₹${((edu['amount'] as num?) ?? 0).toStringAsFixed(0)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                      Text('For ${edu['forMember'] ?? '—'} · Due ${_date10(edu['dueDate'] ?? '')}',
                        style: const TextStyle(fontSize: 11)),
                    ])),
                  )),
                  const SizedBox(height: 8),
                  Container(padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.black, border: Border.all(width: 3)),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      const Text('TOTAL EDUCATION OUTLAY', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      Text('₹${total.toStringAsFixed(0)}', style: const TextStyle(color: Color(0xFFFFE500), fontSize: 22, fontWeight: FontWeight.w900)),
                    ])),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
}

class _EducationForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _EducationForm({this.initial, required this.onSaved});
  @override
  State<_EducationForm> createState() => _EducationFormState();
}

class _EducationFormState extends State<_EducationForm> {
  late final TextEditingController titleCtrl, institutionCtrl, memberCtrl, amountCtrl, dueCtrl, startCtrl, endCtrl, notesCtrl;
  String category = 'School';
  String frequency = 'Monthly';
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    titleCtrl = TextEditingController(text: '${i?['title'] ?? ''}');
    institutionCtrl = TextEditingController(text: '${i?['institution'] ?? ''}');
    memberCtrl = TextEditingController(text: '${i?['forMember'] ?? ''}');
    amountCtrl = TextEditingController(text: i != null ? '${i['amount'] ?? ''}' : '');
    dueCtrl = TextEditingController(text: _date10(i?['dueDate'] ?? ''));
    startCtrl = TextEditingController(text: _date10(i?['startDate'] ?? ''));
    endCtrl = TextEditingController(text: _date10(i?['endDate'] ?? ''));
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['category'] != null && _categories.contains(i!['category'])) category = i['category'];
    if (i?['frequency'] != null && _frequencies.contains(i!['frequency'])) frequency = i['frequency'];
  }

  Future<void> save() async {
    if (titleCtrl.text.trim().isEmpty || (double.tryParse(amountCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Title and amount are required.');
      return;
    }
    setState(() { busy = true; error = null; });
    final payload = {
      'title': titleCtrl.text.trim(),
      'institution': institutionCtrl.text.trim(),
      'category': category,
      'forMember': memberCtrl.text.trim(),
      'amount': double.parse(amountCtrl.text),
      'frequency': frequency,
      if (dueCtrl.text.trim().isNotEmpty) 'dueDate': dueCtrl.text.trim(),
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (endCtrl.text.trim().isNotEmpty) 'endDate': endCtrl.text.trim(),
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put("/education/${widget.initial!['_id'] ?? widget.initial!['id']}", data: payload);
      } else {
        await ApiClient.dio.post('/education', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save payment.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.initial != null ? 'EDIT PAYMENT' : 'ADD PAYMENT', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        if (error != null) ...[const SizedBox(height: 8), Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12))],
        BrutalField(label: 'Title', controller: titleCtrl, hint: 'e.g. Tuition Fees'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Institution', controller: institutionCtrl, hint: 'e.g. Delhi Public School')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'For member', controller: memberCtrl, hint: 'e.g. Aarav')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('CATEGORY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: category, isExpanded: true,
              items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => category = v!)),
          ])),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('FREQUENCY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: frequency, isExpanded: true,
              items: _frequencies.map((f) => DropdownMenuItem(value: f, child: Text(f))).toList(),
              onChanged: (v) => setState(() => frequency = v!)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Amount ₹', controller: amountCtrl, hint: '0')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Due (YYYY-MM-DD)', controller: dueCtrl, hint: '2026-02-01')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Start (YYYY-MM-DD)', controller: startCtrl, hint: '2026-01-01')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'End (YYYY-MM-DD)', controller: endCtrl, hint: '')),
        ]),
        const SizedBox(height: 8),
        BrutalField(label: 'Notes', controller: notesCtrl, hint: 'Additional details…'),
        const SizedBox(height: 12),
        BrutalButton(label: busy ? 'Saving…' : 'Save', onPressed: busy ? null : save),
        const SizedBox(height: 20),
      ])),
    );
  }
}
