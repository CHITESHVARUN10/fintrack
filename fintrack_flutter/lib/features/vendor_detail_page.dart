import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/vendor_name.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/confirm_action.dart';
import '../widgets/spending_trend.dart' show spendingDelta;
import '../widgets/states.dart';
import '../widgets/workspace.dart';
import 'transactions_page.dart';

String vendorName(Map vendor) =>
    readableVendorName('${vendor['label'] ?? vendor['upiId'] ?? 'Vendor'}');

class VendorDetailPage extends StatefulWidget {
  const VendorDetailPage({
    super.key,
    required this.initial,
    required this.onEdit,
    required this.onArchive,
  });

  final Map<String, dynamic> initial;
  final Future<bool> Function(Map vendor) onEdit;
  final Future<bool> Function(Map vendor) onArchive;

  @override
  State<VendorDetailPage> createState() => _VendorDetailPageState();
}

class _VendorDetailPageState extends State<VendorDetailPage> {
  static const pageSize = 25;
  final amount = TextEditingController();
  late Map vendor = widget.initial;
  Map? summary;
  List<Map> transactions = [];
  bool loading = true;
  bool lookingUp = false;
  bool loadingMore = false;
  bool mutating = false;
  String? error;
  String? lookupError;
  String? pageError;
  int tab = 0;
  int revision = 0;
  int lookupRevision = 0;
  int? searchedAmount;
  List<Map> amountProducts = [];
  Map? suggestion;

  String get id => '${widget.initial['_id'] ?? widget.initial['id']}';
  int get count => (summary?['count'] as num?)?.toInt() ?? transactions.length;
  String get ledger => '/vendors/$id/transactions';
  String get directory => '/recipients/$id';
  List<Map> get products =>
      ((vendor['products'] as List?) ?? []).whereType<Map>().toList();

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    final current = ++revision;
    setState(() {
      loading = !more;
      loadingMore = more;
      error = null;
      pageError = null;
    });
    try {
      final res = await ApiClient.dio.get<Map>(
        ledger,
        queryParameters: {
          'skip': more ? transactions.length : 0,
          'limit': pageSize,
        },
      );
      if (!mounted || current != revision) return;
      final data = res.data!;
      final rows = ((data['transactions'] as List?) ?? [])
          .whereType<Map>()
          .toList();
      setState(() {
        summary = data;
        vendor = (data['vendor'] as Map?) ?? vendor;
        transactions = more ? [...transactions, ...rows] : rows;
      });
    } catch (err) {
      if (mounted && current == revision) {
        final message = ApiClient.errorMessage(
          err,
          'Could not load this vendor.',
        );
        setState(() {
          if (more) {
            pageError = message;
          } else {
            error = message;
          }
        });
      }
    } finally {
      if (mounted && current == revision) {
        setState(() {
          loading = false;
          loadingMore = false;
        });
      }
    }
  }

  Future<void> _edit() async {
    final saved = await widget.onEdit(vendor);
    if (saved && mounted) await load();
  }

  Future<void> _archive() async {
    setState(() => mutating = true);
    try {
      final archived = await widget.onArchive(vendor);
      if (archived && mounted) Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => mutating = false);
    }
  }

  Future<void> _lookup() async {
    final paise = parseRupeesToPaise(amount.text);
    if (paise == null) {
      setState(
        () => lookupError = 'Enter a positive amount, such as 30 or 30.50.',
      );
      return;
    }
    final current = ++lookupRevision;
    FocusScope.of(context).unfocus();
    setState(() {
      searchedAmount = paise;
      amountProducts = [];
      suggestion = null;
      lookupError = null;
      lookingUp = true;
    });
    try {
      final response = await ApiClient.dio.get<Map>(
        ledger,
        queryParameters: {'amountPaise': paise, 'limit': 1},
      );
      if (!mounted || current != lookupRevision) return;
      final recorded = ((response.data?['productsAtAmount'] as List?) ?? [])
          .whereType<Map>()
          .toList();
      if (recorded.isNotEmpty) {
        setState(() => amountProducts = recorded);
        return;
      }
      final hint = await ApiClient.dio.get<Map>(
        '$directory/suggest',
        queryParameters: {'amountPaise': paise},
      );
      if (!mounted || current != lookupRevision) return;
      final result = hint.data?['suggestion'];
      if (result is Map) {
        final product = result['product'] is Map
            ? result['product'] as Map
            : result;
        if (product['name'] is String) {
          setState(() => suggestion = product);
        }
      }
    } catch (err) {
      if (mounted && current == lookupRevision) {
        setState(
          () => lookupError = ApiClient.errorMessage(
            err,
            'Could not look up this amount.',
          ),
        );
      }
    } finally {
      if (mounted && current == lookupRevision) {
        setState(() => lookingUp = false);
      }
    }
  }

  Future<void> _editProduct([Map? product]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ProductEditor(
        product: product,
        defaultCategory:
            '${vendor['primaryCategory'] ?? vendor['category'] ?? 'Other'}',
        onSave: (body) async {
          if (product == null) {
            await ApiClient.dio.post('$directory/products', data: body);
          } else {
            await ApiClient.dio.put(
              "$directory/products/${product['_id']}",
              data: body,
            );
          }
        },
      ),
    );
    if (saved == true && mounted) {
      await load();
      if (mounted && searchedAmount != null) await _lookup();
    }
  }

  Future<void> _removeProduct(Map product) async {
    final confirmed = await confirmAction(
      context,
      title: 'Remove product?',
      message: "Remove ${product['name']} from this vendor’s products?",
      action: 'Remove',
    );
    if (!confirmed || !mounted) return;
    setState(() => mutating = true);
    try {
      await ApiClient.dio.delete("$directory/products/${product['_id']}");
      if (!mounted) return;
      await load();
      if (mounted && searchedAmount != null) await _lookup();
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ApiClient.errorMessage(err, 'Could not remove the product.'),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => mutating = false);
    }
  }

  Widget _overview() {
    final today = DateTime.now().toUtc();
    final months = [
      for (var i = 5; i >= 0; i--) DateTime.utc(today.year, today.month - i),
    ];
    final amounts = <String, int>{};
    for (final row
        in ((summary?['monthlyBuckets'] as List?) ?? []).whereType<Map>()) {
      amounts['${row['month']}'] = (row['paise'] as num?)?.toInt() ?? 0;
    }
    int spend(DateTime month) =>
        amounts[month.toIso8601String().substring(0, 7)] ?? 0;
    final current = spend(months.last);
    final previous = spend(months[months.length - 2]);
    final high = months
        .map(spend)
        .fold(1, (max, amount) => amount > max ? amount : max);
    final contact = vendor['contact'] as Map?;
    final facts = <String, Object?>{
      'UPI ID': vendor['upiId'],
      'Category': vendor['primaryCategory'] ?? vendor['category'],
      'Preferred method': contact?['preferredMode'] == null
          ? null
          : transactionModeLabel(contact?['preferredMode']),
      'Phone': contact?['phone'],
      'Email': contact?['email'],
      'Address': contact?['address'],
      'Notes': vendor['notes'],
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        BrutalCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Text(
                'Monthly spending',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 12,
                children: [
                  Expanded(child: _monthTotal('This month so far', current)),
                  Expanded(child: _monthTotal('Previous full month', previous)),
                ],
              ),
              Text(
                spendingDelta(current, previous),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const Divider(),
              for (final month in months)
                Row(
                  spacing: 10,
                  children: [
                    SizedBox(
                      width: 72,
                      child: Text(
                        monthYearLabel(month),
                        style: FinStackType.caption,
                      ),
                    ),
                    Expanded(
                      child: LinearProgressIndicator(
                        value: spend(month) / high,
                        minHeight: 6,
                        color: FinStackColors.accentCyan,
                        backgroundColor: FinStackColors.surfaceLow,
                      ),
                    ),
                    SizedBox(
                      width: 98,
                      child: Text(
                        inrPaise(spend(month)),
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
        BrutalCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Text(
                'Vendor information',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if ('${vendor['description'] ?? ''}'.trim().isNotEmpty)
                Text('${vendor['description']}'),
              for (final fact in facts.entries)
                if ('${fact.value ?? ''}'.trim().isNotEmpty)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 10,
                    children: [
                      SizedBox(
                        width: 104,
                        child: Text(fact.key, style: FinStackType.caption),
                      ),
                      Expanded(child: Text('${fact.value}')),
                    ],
                  ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: mutating ? null : _archive,
                  child: const Text('Archive vendor'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _monthTotal(String label, int paise) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: FinStackType.caption),
      Text(inrPaise(paise), style: FinStackType.amount),
    ],
  );

  Widget _products() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 12,
    children: [
      BrutalCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Text(
              'Look up a payment amount',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            BrutalField(
              label: 'Amount ₹',
              controller: amount,
              hint: 'e.g. 30',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onSubmitted: (_) => _lookup(),
              suffixIcon: IconButton(
                onPressed: lookingUp ? null : _lookup,
                icon: const Icon(Icons.search),
                tooltip: 'Look up products',
              ),
            ),
            Semantics(
              liveRegion: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (lookingUp)
                    const LinearProgressIndicator(
                      semanticsLabel: 'Looking up products',
                    )
                  else if (lookupError != null)
                    Text(lookupError!)
                  else if (amountProducts.isNotEmpty) ...[
                    Text(
                      'Recorded at ${inrPaise(searchedAmount!)}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    for (final item in amountProducts.take(5))
                      Text(
                        "${item['name']} · ${item['count']} recorded payments",
                      ),
                  ] else if (suggestion != null)
                    Text("Saved price match · ${suggestion!['name']}")
                  else if (searchedAmount != null)
                    Text(
                      'No recorded products or saved price match at ${inrPaise(searchedAmount!)}.',
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      BrutalCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Products',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                TextButton.icon(
                  onPressed: mutating ? null : () => _editProduct(),
                  icon: const Icon(Icons.add),
                  label: const Text('Add product'),
                ),
              ],
            ),
            if (products.isEmpty)
              const Text(
                'Add a product and its typical price to help identify future payments.',
              ),
            for (final product in products)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${product['name']}'),
                subtitle: Text(
                  [
                    if (product['category'] != null) '${product['category']}',
                    if (product['typicalAmountPaise'] is num &&
                        product['typicalAmountPaise'] > 0)
                      inrPaise(product['typicalAmountPaise'] as num),
                  ].join(' · '),
                ),
                onTap: mutating ? null : () => _editProduct(product),
                trailing: PopupMenuButton<String>(
                  tooltip: 'Product actions',
                  enabled: !mutating,
                  onSelected: (action) {
                    if (action == 'edit') {
                      _editProduct(product);
                    } else {
                      _removeProduct(product);
                    }
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'edit', child: Text('Edit product')),
                    PopupMenuItem(
                      value: 'remove',
                      child: Text('Remove product'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ],
  );

  Widget _payments() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        '$count transactions · ${inrPaise((summary?['totalPaise'] as num?) ?? 0)} spent',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: 8),
      if (transactions.isEmpty)
        const BrutalEmpty(
          message: 'No transactions are linked to this vendor yet.',
        ),
      for (final row in transactions) ...[
        BrutalCard(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shadow: 2,
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              '${row['productName'] ?? row['category'] ?? 'Transaction'}',
            ),
            subtitle: Text(
              [
                if (DateTime.tryParse('${row['occurredAt'] ?? ''}')
                    case final date?)
                  dateLabel(date.toLocal()),
                transactionModeLabel(row['mode']),
                if (row['isOffset'] == true) 'Offset',
              ].join(' · '),
            ),
            trailing: Text(
              "${row['type'] == 'INCOME' ? '+' : ''}${inrPaise((row['amountPaise'] as num?) ?? 0)}",
              style: FinStackType.amount,
            ),
            onTap: () => showActivityTransaction(
              context,
              id: '${row['_id']}',
              onChanged: load,
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
      if (pageError != null) Text(pageError!),
      if (transactions.length < count)
        OutlinedButton(
          onPressed: loadingMore ? null : () => load(more: true),
          child: Text(loadingMore ? 'Loading…' : 'Load more transactions'),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) => WorkspaceScaffold(
    title: 'Vendor details',
    action: BrutalButton(
      label: 'Edit',
      icon: Icons.edit_outlined,
      onPressed: mutating ? null : _edit,
    ),
    body: loading && summary == null
        ? const BrutalLoading(label: 'Loading vendor')
        : error != null && summary == null
        ? BrutalError(message: error!, onRetry: load)
        : RefreshIndicator(
            onRefresh: load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
              children: [
                Text(
                  vendorName(vendor),
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 12),
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 0, label: Text('Overview')),
                    ButtonSegment(value: 1, label: Text('Products')),
                    ButtonSegment(value: 2, label: Text('Transactions')),
                  ],
                  selected: {tab},
                  showSelectedIcon: false,
                  onSelectionChanged: (value) =>
                      setState(() => tab = value.first),
                ),
                const SizedBox(height: 14),
                if (loading)
                  const LinearProgressIndicator(
                    semanticsLabel: 'Refreshing vendor',
                  ),
                if (error != null) Text(error!),
                switch (tab) {
                  1 => _products(),
                  2 => _payments(),
                  _ => _overview(),
                },
              ],
            ),
          ),
  );
}

class _ProductEditor extends StatefulWidget {
  const _ProductEditor({
    this.product,
    required this.defaultCategory,
    required this.onSave,
  });

  final Map? product;
  final String defaultCategory;
  final Future<void> Function(Map<String, dynamic>) onSave;

  @override
  State<_ProductEditor> createState() => _ProductEditorState();
}

class _ProductEditorState extends State<_ProductEditor> {
  late final name = TextEditingController(
    text: '${widget.product?['name'] ?? ''}',
  );
  late final category = TextEditingController(
    text: '${widget.product?['category'] ?? widget.defaultCategory}',
  );
  late final price = TextEditingController(
    text:
        widget.product?['typicalAmountPaise'] is num &&
            (widget.product!['typicalAmountPaise'] as num) > 0
        ? ((widget.product!['typicalAmountPaise'] as num) / 100).toString()
        : '',
  );
  bool saving = false;
  String? error;

  @override
  void dispose() {
    name.dispose();
    category.dispose();
    price.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final paise = parseRupeesToPaise(price.text);
    if (name.text.trim().isEmpty ||
        category.text.trim().isEmpty ||
        (price.text.trim().isNotEmpty && paise == null)) {
      setState(
        () => error = 'Enter a name, a category and a valid price if known.',
      );
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.onSave({
        'name': name.text.trim(),
        'category': category.text.trim(),
        'typicalAmountPaise': paise,
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (err) {
      if (mounted) {
        setState(
          () => error = ApiClient.errorMessage(
            err,
            'Could not save the product.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          WorkspaceSheetTitle(
            widget.product == null ? 'Add product' : 'Edit product',
          ),
          BrutalField(
            label: 'Product name',
            controller: name,
            enabled: !saving,
          ),
          BrutalField(
            label: 'Category',
            controller: category,
            enabled: !saving,
          ),
          BrutalField(
            label: 'Typical price ₹',
            controller: price,
            hint: 'Optional',
            enabled: !saving,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          if (error != null) Semantics(liveRegion: true, child: Text(error!)),
          BrutalButton(
            label: saving ? 'Saving…' : 'Save product',
            onPressed: saving ? null : _save,
          ),
        ],
      ),
    ),
  );
}
