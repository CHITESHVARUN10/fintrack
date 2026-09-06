import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _insuranceTypes = ['Life', 'Health', 'Vehicle', 'Term', 'Home', 'Other'];
const _premiumFrequencies = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
const _insuranceStatuses = ['Active', 'Lapsed', 'Matured', 'Claimed'];

/// Mirrors website Insurance.tsx: GET/POST/PUT/DELETE /insurance
/// with the same fields.
class InsurancePage extends StatefulWidget {
  const InsurancePage({super.key});
  @override
  State<InsurancePage> createState() => _InsurancePageState();
}

class _InsurancePageState extends State<InsurancePage> {
  List items = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (mounted) setState(() { loading = true; error = null; });
    try {
      final res = await ApiClient.dio.get('/insurance');
      if (!mounted) return;
      setState(() => items = (res.data as List?) ?? []);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load insurance.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Delete?'),
      content: Text('Delete "${item['policyName']}"?'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete'))],
    ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/insurance/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete policy.')));
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _InsuranceForm(
      initial: initial,
      onSaved: () { Navigator.pop(context); load(); },
    ));
  }

  @override
  Widget build(BuildContext context) {
    final totalPremium = items
        .where((e) => (e as Map)['status'] == 'Active')
        .fold<double>(0, (s, e) => s + (((e as Map)['premiumAmount'] as num?)?.toDouble() ?? 0));
    final totalCover = items.fold<double>(0, (s, e) => s + (((e as Map)['sumAssured'] as num?)?.toDouble() ?? 0));
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Expanded(child: Text('INSURANCE\nLife, health, vehicle & other policies.', style: TextStyle(fontSize: 12))),
                    BrutalButton(label: '+ Add', onPressed: () => openForm()),
                  ]),
                  const SizedBox(height: 12),
                  if (items.isEmpty) const BrutalCard(child: Text('No policies yet. Tap + Add to create one.'))
                  else ...items.map((raw) {
                    final ins = Map<String, dynamic>.from(raw as Map);
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Expanded(child: Text('${ins['policyName'] ?? ''}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
                          Row(children: [
                            IconButton(icon: const Icon(Icons.edit, size: 18), onPressed: () => openForm(initial: ins)),
                            IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(ins)),
                          ]),
                        ]),
                        Text('${ins['insurer'] ?? ''} · ${ins['policyNumber'] ?? ''}', style: const TextStyle(fontSize: 11)),
                        const SizedBox(height: 4),
                        Row(children: [
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(border: Border.all(width: 2)),
                            child: Text('${ins['insuranceType'] ?? 'Other'}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                          const SizedBox(width: 6),
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(border: Border.all(width: 2)),
                            child: Text('${ins['status'] ?? 'Active'}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                          const SizedBox(width: 6),
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(border: Border.all(width: 2)),
                            child: Text((ins['tax80C'] == true) ? '80C Yes' : '80C No', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                        ]),
                        const SizedBox(height: 6),
                        Text('₹${((ins['premiumAmount'] as num?) ?? 0).toStringAsFixed(0)} / ${(ins['premiumFrequency'] ?? 'Yearly').toString().toLowerCase()}',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                        Text('Sum assured ₹${((ins['sumAssured'] as num?) ?? 0).toStringAsFixed(0)} · Nominee ${ins['nominee'] ?? '—'}',
                          style: const TextStyle(fontSize: 11)),
                        Text('Next due ${(('${ins['nextDueDate'] ?? ''}').length >= 10) ? ('${ins['nextDueDate']}').substring(0, 10) : (ins['nextDueDate'] ?? '—')}',
                          style: const TextStyle(fontSize: 11)),
                      ])),
                    );
                  }),
                  const SizedBox(height: 8),
                  Container(padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.black, border: Border.all(width: 3)),
                    child: Column(children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('ACTIVE PREMIUM', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                        Text('₹${totalPremium.toStringAsFixed(0)}', style: const TextStyle(color: Color(0xFFFFE500), fontSize: 20, fontWeight: FontWeight.w900)),
                      ]),
                      const SizedBox(height: 8),
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('TOTAL COVER', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                        Text('₹${totalCover.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
                      ]),
                    ])),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
}

class _InsuranceForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _InsuranceForm({this.initial, required this.onSaved});
  @override
  State<_InsuranceForm> createState() => _InsuranceFormState();
}

class _InsuranceFormState extends State<_InsuranceForm> {
  late final TextEditingController nameCtrl, insurerCtrl, policyNoCtrl;
  late final TextEditingController sumCtrl, premiumCtrl, nomineeCtrl;
  late final TextEditingController dueCtrl, startCtrl, endCtrl, notesCtrl;
  String insuranceType = 'Life';
  String premiumFrequency = 'Yearly';
  String status = 'Active';
  bool tax80C = false;
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    nameCtrl = TextEditingController(text: '${i?['policyName'] ?? ''}');
    insurerCtrl = TextEditingController(text: '${i?['insurer'] ?? ''}');
    policyNoCtrl = TextEditingController(text: '${i?['policyNumber'] ?? ''}');
    sumCtrl = TextEditingController(text: i != null ? '${i['sumAssured'] ?? ''}' : '');
    premiumCtrl = TextEditingController(text: i != null ? '${i['premiumAmount'] ?? ''}' : '');
    nomineeCtrl = TextEditingController(text: '${i?['nominee'] ?? ''}');
    dueCtrl = TextEditingController(text: (('${i?['nextDueDate'] ?? ''}').length >= 10) ? ('${i?['nextDueDate']}').substring(0, 10) : '');
    startCtrl = TextEditingController(text: (('${i?['startDate'] ?? ''}').length >= 10) ? ('${i?['startDate']}').substring(0, 10) : '');
    endCtrl = TextEditingController(text: (('${i?['endDate'] ?? ''}').length >= 10) ? ('${i?['endDate']}').substring(0, 10) : '');
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['insuranceType'] != null && _insuranceTypes.contains(i!['insuranceType'])) insuranceType = i['insuranceType'];
    if (i?['premiumFrequency'] != null && _premiumFrequencies.contains(i!['premiumFrequency'])) premiumFrequency = i['premiumFrequency'];
    if (i?['status'] != null && _insuranceStatuses.contains(i!['status'])) status = i['status'];
    tax80C = (i?['tax80C'] ?? false) == true;
  }

  Future<void> save() async {
    if (nameCtrl.text.trim().isEmpty || (double.tryParse(premiumCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Policy name and premium are required.');
      return;
    }
    setState(() { busy = true; error = null; });
    final payload = {
      'policyName': nameCtrl.text.trim(),
      'insurer': insurerCtrl.text.trim(),
      'insuranceType': insuranceType,
      'policyNumber': policyNoCtrl.text.trim(),
      'sumAssured': double.tryParse(sumCtrl.text) ?? 0,
      'premiumAmount': double.tryParse(premiumCtrl.text) ?? 0,
      'premiumFrequency': premiumFrequency,
      if (dueCtrl.text.trim().isNotEmpty) 'nextDueDate': dueCtrl.text.trim(),
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (endCtrl.text.trim().isNotEmpty) 'endDate': endCtrl.text.trim(),
      'nominee': nomineeCtrl.text.trim(),
      'status': status,
      'tax80C': tax80C,
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put("/insurance/${widget.initial!['_id'] ?? widget.initial!['id']}", data: payload);
      } else {
        await ApiClient.dio.post('/insurance', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save policy.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.initial != null ? 'EDIT POLICY' : 'ADD POLICY', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        if (error != null) ...[const SizedBox(height: 8), Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12))],
        BrutalField(label: 'Policy name', controller: nameCtrl, hint: 'e.g. Term Plan'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Insurer', controller: insurerCtrl, hint: 'e.g. LIC')),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('TYPE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: insuranceType, isExpanded: true,
              items: _insuranceTypes.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => insuranceType = v!)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Policy number', controller: policyNoCtrl, hint: '')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Nominee', controller: nomineeCtrl, hint: '')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Sum assured ₹', controller: sumCtrl, hint: '0')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Premium ₹', controller: premiumCtrl, hint: '0')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('FREQUENCY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: premiumFrequency, isExpanded: true,
              items: _premiumFrequencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => premiumFrequency = v!)),
          ])),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('STATUS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: status, isExpanded: true,
              items: _insuranceStatuses.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => status = v!)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Next due (YYYY-MM-DD)', controller: dueCtrl, hint: '2026-06-01')),
          const SizedBox(width: 8),
          Expanded(child: Row(children: [
            Checkbox(value: tax80C, onChanged: (v) => setState(() => tax80C = v ?? false)),
            const Text('80C benefit', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Start (YYYY-MM-DD)', controller: startCtrl, hint: '2026-01-01')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'End (YYYY-MM-DD)', controller: endCtrl, hint: '2036-01-01')),
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
