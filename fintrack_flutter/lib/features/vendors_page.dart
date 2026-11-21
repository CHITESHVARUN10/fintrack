import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/vendor_name.dart';
import '../widgets/confirm_action.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';
import 'vendor_detail_page.dart';

const _modes = ['', 'UPI', 'BANK', 'CASH', 'CARD', 'OTHER'];

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
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final res = await ApiClient.dio.get(
        '/recipients',
        queryParameters: (q != null && q.trim().isNotEmpty)
            ? {'q': q.trim()}
            : null,
      );
      final d = res.data;
      final list = d is List
          ? d
          : ((d is Map ? d['items'] : null) as List?) ?? [];
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Backfilled $touched vendors from $scanned transactions.',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Backfill failed.')));
      }
    } finally {
      if (mounted) setState(() => backfilling = false);
    }
  }

  Future<bool> remove(Map item) async {
    final ok = await confirmAction(
      context,
      title: 'Archive vendor?',
      message:
          'Archive "${vendorName(item)}"? Its transactions will stay in Activity.',
      action: 'Archive',
    );
    if (!ok || !mounted) return false;
    try {
      await ApiClient.dio.delete("/recipients/${item['_id'] ?? item['id']}");
      if (mounted) await load(q: searchCtrl.text);
      return true;
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not archive vendor.')),
        );
      }
      return false;
    }
  }

  Future<bool> openForm({Map? initial}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _VendorForm(initial: initial),
    );
    if (saved == true && mounted) await load(q: searchCtrl.text);
    return saved == true;
  }

  Future<void> _openDetails(Map<String, dynamic> item) async {
    dismissKeyboard(context);
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => VendorDetailPage(
          initial: item,
          onEdit: (vendor) => openForm(initial: vendor),
          onArchive: remove,
        ),
      ),
    );
  }

  String _categoryOf(Map v) {
    final off = (v['offerings'] as List?);
    if (off != null && off.isNotEmpty && off.first is Map) {
      return '${off.first['category'] ?? ''}';
    }
    return '${v['primaryCategory'] ?? v['category'] ?? 'Other'}';
  }

  @override
  Widget build(BuildContext context) => WorkspaceScaffold(
    title: 'Vendors',
    action: BrutalButton(label: '+ New', onPressed: openForm),
    body: loading
        ? const BrutalLoading(label: 'Loading vendors…')
        : error != null
        ? BrutalError(
            message: error!,
            onRetry: () => load(q: searchCtrl.text),
          )
        : ListView(
            padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
            children: [
              const WorkspaceIntro(
                'Vendor directory',
                'Teach FinStack what each vendor offers.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: searchCtrl,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Search vendors',
                  hintText: 'Vendor, UPI ID, or alias',
                ),
                textInputAction: TextInputAction.search,
                onSubmitted: (value) => load(q: value),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: BrutalButton(
                      label: 'Search',
                      onPressed: () {
                        dismissKeyboard(context);
                        load(q: searchCtrl.text);
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: BrutalButton(
                      label: backfilling ? 'Backfilling…' : 'Backfill',
                      onPressed: backfilling ? null : backfill,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 13),
              if (items.isEmpty)
                BrutalEmpty(
                  icon: Icons.storefront_outlined,
                  message: searchCtrl.text.trim().isEmpty
                      ? 'Add a vendor or backfill from your transactions.'
                      : 'No vendors match your search.',
                )
              else
                for (final item in items.whereType<Map>())
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _vendorCard(Map<String, dynamic>.from(item)),
                  ),
            ],
          ),
  );

  Widget _vendorCard(Map<String, dynamic> item) => BrutalCard(
    padding: const EdgeInsets.symmetric(horizontal: 12),
    child: Material(
      color: Colors.transparent,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(
          vendorName(item),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        subtitle: Text(_categoryOf(item)),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _openDetails(item),
      ),
    ),
  );
}

class _VendorForm extends StatefulWidget {
  final Map? initial;
  const _VendorForm({this.initial});
  @override
  State<_VendorForm> createState() => _VendorFormState();
}

class _VendorFormState extends State<_VendorForm> {
  late final TextEditingController labelCtrl,
      upiCtrl,
      categoryCtrl,
      descCtrl,
      notesCtrl,
      phoneCtrl,
      emailCtrl,
      addressCtrl,
      aliasesCtrl;
  String mode = '';
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    labelCtrl = TextEditingController(text: i == null ? '' : vendorName(i));
    upiCtrl = TextEditingController(text: '${i?['upiId'] ?? ''}');
    final knownCategories = ((i?['offerings'] as List?) ?? [])
        .whereType<Map>()
        .map((offering) => offering['category'])
        .whereType<String>()
        .where((value) => value.trim().isNotEmpty);
    categoryCtrl = TextEditingController(
      text: knownCategories.isNotEmpty
          ? knownCategories.join(', ')
          : '${i?['primaryCategory'] ?? i?['category'] ?? ''}',
    );
    descCtrl = TextEditingController(text: '${i?['description'] ?? ''}');
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    final contact = i?['contact'] as Map?;
    phoneCtrl = TextEditingController(text: '${contact?['phone'] ?? ''}');
    emailCtrl = TextEditingController(text: '${contact?['email'] ?? ''}');
    addressCtrl = TextEditingController(text: '${contact?['address'] ?? ''}');
    aliasesCtrl = TextEditingController(
      text: ((i?['aliases'] as List?) ?? []).join(', '),
    );
    final savedMode = '${contact?['preferredMode'] ?? ''}';
    if (_modes.contains(savedMode)) mode = savedMode;
  }

  @override
  void dispose() {
    for (final controller in [
      labelCtrl,
      upiCtrl,
      categoryCtrl,
      descCtrl,
      notesCtrl,
      phoneCtrl,
      emailCtrl,
      addressCtrl,
      aliasesCtrl,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    if (busy) return;
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
      final body = {
        'label': labelCtrl.text.trim(),
        'upiId': upiCtrl.text.trim(),
        'categories': cats,
        'description': descCtrl.text.trim(),
        'notes': notesCtrl.text.trim(),
        'aliases': aliasesCtrl.text
            .split(',')
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty)
            .toList(),
        'contact': {
          'phone': phoneCtrl.text.trim(),
          'email': emailCtrl.text.trim(),
          'address': addressCtrl.text.trim(),
          'preferredMode': mode,
        },
      };
      if (widget.initial != null) {
        await ApiClient.dio.put(
          "/recipients/${widget.initial!['_id'] ?? widget.initial!['id']}",
          data: body,
        );
      } else {
        await ApiClient.dio.post('/recipients', data: body);
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (err) {
      if (mounted) {
        setState(
          () => error = ApiClient.errorMessage(err, 'Could not save vendor.'),
        );
      }
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
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            WorkspaceSheetTitle(
              widget.initial != null ? 'Edit vendor' : 'New vendor',
            ),
            const SizedBox(height: 8),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
            BrutalField(
              label: 'Vendor name',
              controller: labelCtrl,
              hint: 'e.g. Dairy Guy',
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'UPI ID',
              controller: upiCtrl,
              hint: 'dairyguy@upi',
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'PREFERRED MODE',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      DropdownButton<String>(
                        value: mode,
                        isExpanded: true,
                        items: _modes
                            .map(
                              (m) => DropdownMenuItem(
                                value: m,
                                child: Text(
                                  m.isEmpty
                                      ? 'Not set'
                                      : transactionModeLabel(m),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (v) => setState(() => mode = v!),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BrutalField(
                    label: 'Categories',
                    controller: categoryCtrl,
                    hint: 'Groceries',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Description',
              controller: descCtrl,
              hint: 'e.g. Dairy guy near society',
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Notes',
              controller: notesCtrl,
              hint: 'Optional',
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Phone',
              controller: phoneCtrl,
              hint: 'Contact phone',
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Email',
              controller: emailCtrl,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 8),
            BrutalField(label: 'Address', controller: addressCtrl),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Aliases',
              controller: aliasesCtrl,
              hint: 'Comma-separated names',
            ),
            const SizedBox(height: 12),
            BrutalButton(
              label: busy ? 'Saving…' : 'Save',
              onPressed: busy ? null : save,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
