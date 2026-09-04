import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _categories = ['Salary', 'Freelance', 'Rental', 'Business', 'Other'];

/// Mirrors website Income.tsx: GET/POST/PUT/DELETE /income with the same fields.
class IncomePage extends StatefulWidget {
  const IncomePage({super.key});
  @override
  State<IncomePage> createState() => _IncomePageState();
}

class _IncomePageState extends State<IncomePage> {
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
      final res = await ApiClient.dio.get('/income');
      setState(() => items = (res.data as List?) ?? []);
    } catch (e) {
      setState(() => error = 'Could not load income.');
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
      await ApiClient.dio.delete("/income/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete income.')));
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _IncomeForm(
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
                    const Expanded(child: Text('INCOME SOURCES\nAll recurring monthly streams.', style: TextStyle(fontSize: 12))),
                    BrutalButton(label: '+ Add', onPressed: () => openForm()),
                  ]),
                  const SizedBox(height: 12),
                  if (items.isEmpty) const BrutalCard(child: Text('No income sources yet. Tap + Add to create one.'))
                  else ...items.map((inc) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Expanded(child: Text('${inc['title'] ?? ''}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
                        Row(children: [
                          IconButton(icon: const Icon(Icons.edit, size: 18), onPressed: () => openForm(initial: Map<String, dynamic>.from(inc))),
                          IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(inc)),
                        ]),
                      ]),
                      Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(border: Border.all(width: 2)),
                        child: Text('${inc['category'] ?? 'Other'}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                      const SizedBox(height: 6),
                      Text('₹${((inc['amount'] as num?) ?? 0).toStringAsFixed(0)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                      Text('Credits on day ${inc['creditDate'] ?? 1} · ${(inc['taxable'] == true) ? 'Taxable' : 'Non-Taxable'}',
                        style: const TextStyle(fontSize: 11)),
                    ])),
                  )),
                  const SizedBox(height: 8),
                  Container(padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.black, border: Border.all(width: 3)),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      const Text('TOTAL MONTHLY', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                      Text('₹${total.toStringAsFixed(0)}', style: const TextStyle(color: Color(0xFFFFE500), fontSize: 22, fontWeight: FontWeight.w900)),
                    ])),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
}

class _IncomeForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _IncomeForm({this.initial, required this.onSaved});
  @override
  State<_IncomeForm> createState() => _IncomeFormState();
}

class _IncomeFormState extends State<_IncomeForm> {
  late final TextEditingController titleCtrl, amountCtrl, creditCtrl, startCtrl, notesCtrl;
  String category = 'Salary';
  bool taxable = true;
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    titleCtrl = TextEditingController(text: '${i?['title'] ?? ''}');
    amountCtrl = TextEditingController(text: i != null ? '${i['amount'] ?? ''}' : '');
    creditCtrl = TextEditingController(text: '${i?['creditDate'] ?? 1}');
    startCtrl = TextEditingController(text: (('${i?['startDate'] ?? ''}').length >= 10) ? ('${i?['startDate']}').substring(0, 10) : '');
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['category'] != null && _categories.contains(i!['category'])) category = i['category'];
    taxable = (i?['taxable'] ?? true) == true;
  }

  Future<void> save() async {
    if (titleCtrl.text.trim().isEmpty || (double.tryParse(amountCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Title and amount are required.');
      return;
    }
    setState(() { busy = true; error = null; });
    final payload = {
      'title': titleCtrl.text.trim(),
      'amount': double.parse(amountCtrl.text),
      'category': category,
      'creditDate': int.tryParse(creditCtrl.text) ?? 1,
      'taxable': taxable,
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put("/income/${widget.initial!['_id'] ?? widget.initial!['id']}", data: payload);
      } else {
        await ApiClient.dio.post('/income', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save income.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.initial != null ? 'EDIT INCOME' : 'ADD INCOME', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        if (error != null) ...[const SizedBox(height: 8), Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12))],
        BrutalField(label: 'Title', controller: titleCtrl, hint: 'e.g. Main Salary'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Amount ₹', controller: amountCtrl, hint: '0')),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('CATEGORY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: category, isExpanded: true,
              items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => category = v!)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Credit day (1-31)', controller: creditCtrl, hint: '1')),
          const SizedBox(width: 8),
          Expanded(child: Row(children: [
            Checkbox(value: taxable, onChanged: (v) => setState(() => taxable = v ?? true)),
            Text(taxable ? 'Taxable' : 'Non-taxable', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ])),
        ]),
        const SizedBox(height: 8),
        BrutalField(label: 'Start date (YYYY-MM-DD)', controller: startCtrl, hint: '2026-01-01'),
        const SizedBox(height: 8),
        BrutalField(label: 'Notes', controller: notesCtrl, hint: 'Additional details…'),
        const SizedBox(height: 12),
        BrutalButton(label: busy ? 'Saving…' : 'Save', onPressed: busy ? null : save),
        const SizedBox(height: 20),
      ])),
    );
  }
}
