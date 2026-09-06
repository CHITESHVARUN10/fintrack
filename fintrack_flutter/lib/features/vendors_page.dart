import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _modes = ['UPI', 'BANK', 'CASH', 'CARD', 'OTHER'];

/// Mirrors website Vendors.tsx: GET/POST/PUT/DELETE /recipients
/// with ?q= search, plus POST /recipients/backfill.
class VendorsPage extends StatefulWidget {
  const VendorsPage({super.key});
  @override
  State<VendorsPage> createState() => _VendorsPageState();
}

class _VendorsPageState extends State<VendorsPage> {
  List items = [];
  bool loading = true;
  String? error;
  bool backfilling = false;
  final searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    searchCtrl.dispose();
    super.dispose();
  }

  Future<void> load({String? q}) async {
    if (mounted) setState(() { loading = true; error = null; });
    try {
      final res = await ApiClient.dio.get('/recipients',
          queryParameters: (q != null && q.trim().isNotEmpty) ? {'q': q.trim()} : null);
      final d = res.data;
      final list = d is List ? d : ((d is Map ? d['items'] : null) as List?) ?? [];
      if (mounted) setState(() => items = list);
    } catch (e) {
      if (mounted) setState(() => error = 'Could not load vendors.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> backfill() async {
    if (mounted) setState(() => backfilling = true);
    try {
      final res = await ApiClient.dio.post('/recipients/backfill');
      final d = res.data is Map ? res.data as Map : {};
      final touched = d['touched'] ?? 0;
      final scanned = d['scanned'] ?? 0;
      await load(q: searchCtrl.text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Backfilled $touched vendors from $scanned transactions.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Backfill failed.')));
      }
    } finally {
      if (mounted) setState(() => backfilling = false);
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Archive vendor?'),
              content: Text(
                  'Archive "${item['label']}"? Transactions remain but vendor is hidden.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel')),
                TextButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Archive')),
              ],
            ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/recipients/${item['_id'] ?? item['id']}");
      await load(q: searchCtrl.text);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not archive vendor.')));
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (_) => _VendorForm(
              initial: initial,
              onSaved: () {
                Navigator.pop(context);
                load(q: searchCtrl.text);
              },
            ));
  }

  String _categoryOf(Map v) {
    final off = (v['offerings'] as List?);
    if (off != null && off.isNotEmpty && off.first is Map) {
      return '${off.first['category'] ?? ''}';
    }
    return '${v['primaryCategory'] ?? v['category'] ?? 'Other'}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  const Text('VENDORS\nTeach FinTrack what each vendor offers.',
                      style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: searchCtrl,
                    decoration: const InputDecoration(
                        hintText: 'Search vendors, UPI, alias…'),
                    onSubmitted: (v) => load(q: v),
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(
                        child: BrutalButton(
                            label: 'Search',
                            onPressed: () => load(q: searchCtrl.text))),
                    const SizedBox(width: 8),
                    Expanded(
                        child: BrutalButton(
                            label: backfilling ? 'Backfilling…' : 'Backfill',
                            onPressed: backfilling ? null : backfill)),
                  ]),
                  const SizedBox(height: 8),
                  BrutalButton(
                      label: '+ New Vendor',
                      onPressed: () => openForm()),
                  const SizedBox(height: 12),
                  if (items.isEmpty)
                    const BrutalCard(
                        child: Text(
                            'No vendors yet. Tap + New Vendor to create one, or Backfill to rebuild from transactions.'))
                  else
                    ...items.map((v) {
                      final m = Map<String, dynamic>.from(v as Map);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: BrutalCard(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                        child: Text('${m['label'] ?? ''}',
                                            style: const TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w800))),
                                    Row(children: [
                                      IconButton(
                                          icon: const Icon(Icons.edit,
                                              size: 18),
                                          onPressed: () =>
                                              openForm(initial: m)),
                                      IconButton(
                                          icon: const Icon(Icons.delete,
                                              size: 18),
                                          onPressed: () => remove(m)),
                                    ]),
                                  ]),
                              if ('${m['vendorKey'] ?? ''}'.isNotEmpty)
                                Text('${m['vendorKey']}',
                                    style: const TextStyle(
                                        fontSize: 11, color: Colors.grey)),
                              const SizedBox(height: 4),
                              Wrap(spacing: 6, runSpacing: 4, children: [
                                Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2),
                                    decoration:
                                        BoxDecoration(border: Border.all(width: 2)),
                                    child: Text(_categoryOf(m),
                                        style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800))),
                                if ('${m['upiId'] ?? ''}'.isNotEmpty)
                                  Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                          border: Border.all(width: 2)),
                                      child: Text('${m['upiId']}',
                                          style: const TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800))),
                                if (m['contact'] is Map &&
                                    '${m['contact']['preferredMode'] ?? ''}'
                                        .isNotEmpty)
                                  Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                          border: Border.all(width: 2)),
                                      child: Text(
                                          '${m['contact']['preferredMode']}',
                                          style: const TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800))),
                              ]),
                              const SizedBox(height: 6),
                              Text(
                                  'hits ${m['hits'] ?? 0}${m['lastSeen'] != null ? ' · last seen ${('${m['lastSeen']}').length >= 10 ? ('${m['lastSeen']}').substring(0, 10) : m['lastSeen']}' : ''}',
                                  style: const TextStyle(fontSize: 11)),
                              if ('${m['description'] ?? ''}'.isNotEmpty)
                                Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text('${m['description']}',
                                        style: const TextStyle(fontSize: 12))),
                            ])),
                      );
                    }),
                ]),
      floatingActionButton:
          FloatingActionButton(onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
}

class _VendorForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _VendorForm({this.initial, required this.onSaved});
  @override
  State<_VendorForm> createState() => _VendorFormState();
}

class _VendorFormState extends State<_VendorForm> {
  late final TextEditingController labelCtrl,
      upiCtrl,
      categoryCtrl,
      descCtrl,
      notesCtrl,
      phoneCtrl;
  String mode = 'UPI';
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    labelCtrl = TextEditingController(text: '${i?['label'] ?? ''}');
    upiCtrl = TextEditingController(text: '${i?['upiId'] ?? ''}');
    String cat = '';
    final off = i?['offerings'] as List?;
    if (off != null && off.isNotEmpty && off.first is Map) {
      cat = '${off.first['category'] ?? ''}';
    } else {
      cat = '${i?['primaryCategory'] ?? i?['category'] ?? ''}';
    }
    categoryCtrl = TextEditingController(text: cat);
    descCtrl = TextEditingController(text: '${i?['description'] ?? ''}');
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    phoneCtrl = TextEditingController(
        text: i?['contact'] is Map ? '${i?['contact']['phone'] ?? ''}' : '');
    final m = i?['contact'] is Map ? '${i?['contact']['preferredMode'] ?? ''}' : '';
    if (m.isNotEmpty && _modes.contains(m)) mode = m;
  }

  Future<void> save() async {
    final cats = categoryCtrl.text
        .split(',')
        .map((c) => c.trim())
        .where((c) => c.isNotEmpty)
        .toList();
    if (labelCtrl.text.trim().isEmpty) {
      setState(() => error = 'Label is required.');
      return;
    }
    if (cats.isEmpty) {
      setState(() => error = 'Pick at least one category.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put(
            "/recipients/${widget.initial!['_id'] ?? widget.initial!['id']}",
            data: {
              'label': labelCtrl.text.trim(),
              if (upiCtrl.text.trim().isNotEmpty)
                'upiId': upiCtrl.text.trim(),
              'categories': cats,
              'description': descCtrl.text.trim(),
              'notes': notesCtrl.text.trim(),
              'contact': {
                if (phoneCtrl.text.trim().isNotEmpty)
                  'phone': phoneCtrl.text.trim(),
                'preferredMode': mode,
              },
            });
      } else {
        await ApiClient.dio.post('/recipients', data: {
          'label': labelCtrl.text.trim(),
          if (upiCtrl.text.trim().isNotEmpty) 'upiId': upiCtrl.text.trim(),
          'preferredMode': mode,
          'categories': cats,
        });
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save vendor.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: 16,
          right: 16,
          top: 16),
      child: SingleChildScrollView(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
            Text(widget.initial != null ? 'EDIT VENDOR' : 'NEW VENDOR',
                style:
                    const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(error!,
                  style: const TextStyle(color: Colors.red, fontSize: 12)),
            ],
            BrutalField(label: 'Label', controller: labelCtrl, hint: 'e.g. Dairy Guy'),
            const SizedBox(height: 8),
            BrutalField(
                label: 'UPI ID', controller: upiCtrl, hint: 'dairyguy@upi'),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('PREFERRED MODE',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700)),
                    DropdownButton<String>(
                        value: mode,
                        isExpanded: true,
                        items: _modes
                            .map((m) =>
                                DropdownMenuItem(value: m, child: Text(m)))
                            .toList(),
                        onChanged: (v) => setState(() => mode = v!)),
                  ])),
              const SizedBox(width: 8),
              Expanded(
                  child: BrutalField(
                      label: 'Category', controller: categoryCtrl, hint: 'Groceries')),
            ]),
            const SizedBox(height: 8),
            BrutalField(
                label: 'Description',
                controller: descCtrl,
                hint: 'e.g. Dairy guy near society'),
            const SizedBox(height: 8),
            BrutalField(label: 'Notes', controller: notesCtrl, hint: 'Private notes…'),
            const SizedBox(height: 8),
            BrutalField(label: 'Phone', controller: phoneCtrl, hint: 'Contact phone'),
            const SizedBox(height: 12),
            BrutalButton(
                label: busy ? 'Saving…' : 'Save',
                onPressed: busy ? null : save),
            const SizedBox(height: 20),
          ])),
    );
  }
}
