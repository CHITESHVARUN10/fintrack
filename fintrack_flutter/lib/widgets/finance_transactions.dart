import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/vendor_name.dart';
import '../theme/finstack_theme.dart';
import 'brutal.dart';
import 'states.dart';
import 'workspace.dart';

const _purposes = {
  'fd': {'deposit': 'Deposit funding', 'maturity': 'Maturity payout'},
  'stock': {'purchase': 'Stock purchase', 'dividend': 'Dividend received'},
  'income': {'receipt': 'Income received'},
};

void showFinanceTransactions(
  BuildContext context, {
  required String kind,
  required String id,
  required String name,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _FinanceTransactions(kind: kind, id: id, name: name),
  );
}

class _FinanceTransactions extends StatefulWidget {
  const _FinanceTransactions({
    required this.kind,
    required this.id,
    required this.name,
  });

  final String kind;
  final String id;
  final String name;

  @override
  State<_FinanceTransactions> createState() => _FinanceTransactionsState();
}

class _FinanceTransactionsState extends State<_FinanceTransactions> {
  final search = TextEditingController();
  final amount = TextEditingController();
  String view = 'linked';
  String query = '';
  DateTime? from;
  DateTime? to;
  int? amountPaise;
  int page = 1;
  int requestVersion = 0;
  List<Map> items = [];
  bool hasMore = false;
  bool canManage = false;
  bool loading = true;
  bool busy = false;
  String? error;
  String? feedback;

  bool get linked => view == 'linked';
  bool get filtered =>
      query.isNotEmpty || from != null || to != null || amountPaise != null;
  bool get canFilter => !linked && !busy;
  Map<String, String> get roles => _purposes[widget.kind]!;
  String get path =>
      "/${widget.kind == 'income' ? 'income' : 'investments'}/${widget.id}/transactions";

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    search.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> load() async {
    final version = ++requestVersion;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await ApiClient.dio.get<Map>(
        path,
        queryParameters: {
          'view': linked ? 'linked' : 'available',
          'role': view,
          'page': page,
          if (query.isNotEmpty) 'q': query,
          if (from != null) 'from': _day(from!),
          if (to != null) 'to': _day(to!),
          'amountPaise': ?amountPaise,
        },
      );
      if (!mounted || version != requestVersion) return;
      final data = response.data!;
      setState(() {
        items = (data['items'] as List).whereType<Map>().toList();
        canManage = data['canManage'] == true;
        hasMore = data['hasMore'] == true;
      });
    } catch (e) {
      if (mounted && version == requestVersion) {
        setState(
          () =>
              error = ApiClient.errorMessage(e, 'Could not load transactions.'),
        );
      }
    } finally {
      if (mounted && version == requestVersion) setState(() => loading = false);
    }
  }

  static String _day(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  void updateSearch(String value) {
    FocusScope.of(context).unfocus();
    query = value.trim();
    page = 1;
    load();
  }

  void applyAmount(String value) {
    final parsed = parseRupeesToPaise(value);
    final blank = value.trim().isEmpty;
    if (!blank && parsed == null) return;
    amountPaise = parsed;
    page = 1;
    load();
  }

  Future<void> pickDay({required bool start}) async {
    dismissKeyboard(context);
    final now = DateUtils.dateOnly(DateTime.now());
    final lower = start ? DateTime(1950) : (from ?? DateTime(1950));
    final upper = start ? (to ?? now) : now;
    final anchor = start ? from : to;
    final picked = await showDatePicker(
      context: context,
      helpText: start ? 'Choose start date' : 'Choose end date',
      firstDate: lower,
      lastDate: upper,
      initialDate: anchor ?? upper,
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (start) {
        from = picked;
        if (to != null && to!.isBefore(picked)) to = picked;
      } else {
        to = picked;
        if (from != null && from!.isAfter(picked)) from = picked;
      }
      page = 1;
    });
    await load();
  }

  Future<void> clearFilters() async {
    dismissKeyboard(context);
    search.clear();
    amount.clear();
    setState(() {
      query = '';
      from = null;
      to = null;
      amountPaise = null;
      page = 1;
      feedback = null;
    });
    await load();
  }

  Future<void> changeLink(Map row) async {
    final unlink = linked;
    final transaction = "$path/${row['_id']}";
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      if (unlink) {
        await ApiClient.dio.delete(transaction);
      } else {
        await ApiClient.dio.put(transaction, data: {'role': view});
      }
      if (!mounted) return;
      setState(
        () =>
            feedback = unlink ? 'Transaction unlinked.' : 'Transaction linked.',
      );
      page = 1;
      await load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ApiClient.errorMessage(e, 'Could not update the link.'),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget row(Map item) {
    final incoming = item['type'] == 'INCOME';
    final party = item[incoming ? 'sender' : 'recipient'] as Map?;
    final other = item[incoming ? 'recipient' : 'sender'] as Map?;
    final names =
        [
              party?['name'],
              party?['upiId'],
              other?['name'],
              other?['upiId'],
              item['productName'],
            ]
            .whereType<String>()
            .map((value) => readableVendorName(value).trim())
            .where((value) => value.isNotEmpty)
            .toList();
    final label = names.isEmpty ? 'Ledger entry' : names.first;
    final rawDate = '${item['occurredAt'] ?? ''}'.split('T').first;
    final amount = inr(((item['amountPaise'] as num?) ?? 0) / 100);
    final role = roles[(item['financeLink'] as Map?)?['role']];
    return BrutalCard(
      shadow: 2,
      padding: const EdgeInsets.all(10),
      child: Row(
        spacing: 8,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 4,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text('$rawDate · $amount', style: FinStackType.caption),
                if (role != null) Text(role, style: FinStackType.caption),
                if (item['suggested'] == true)
                  const BrutalTag(label: 'Suggested match'),
              ],
            ),
          ),
          if (canManage)
            BrutalButton(
              label: linked ? 'Unlink' : 'Link',
              onPressed: busy ? null : () => changeLink(item),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .86,
      minChildSize: .5,
      maxChildSize: .97,
      builder: (context, scroll) => SafeArea(
        top: false,
        child: ListView(
          controller: scroll,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          children: [
            const WorkspaceSheetTitle('Transactions'),
            Text(widget.name, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: view,
              decoration: const InputDecoration(labelText: 'Show transactions'),
              items: [
                const DropdownMenuItem(
                  value: 'linked',
                  child: Text('Linked transactions'),
                ),
                if (canManage)
                  for (final role in roles.entries)
                    DropdownMenuItem(
                      value: role.key,
                      child: Text('Link ${role.value.toLowerCase()}'),
                    ),
              ],
              onChanged: busy
                  ? null
                  : (value) {
                      view = value!;
                      search.clear();
                      amount.clear();
                      query = '';
                      from = null;
                      to = null;
                      amountPaise = null;
                      feedback = null;
                      updateSearch('');
                    },
            ),
            if (!linked) ...[
              const SizedBox(height: 12),
              if (widget.kind == 'income')
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Link a payment to teach FinStack who pays you. Similar payments will be suggested here.',
                  ),
                ),
              BrutalField(
                label: 'Find a transaction',
                controller: search,
                enabled: !busy,
                hint: 'Counterparty or item',
                textInputAction: TextInputAction.search,
                onSubmitted: updateSearch,
                suffixIcon: IconButton(
                  onPressed: busy ? null : () => updateSearch(search.text),
                  icon: const Icon(Icons.search),
                  tooltip: 'Search transactions',
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  BrutalButton(
                    label: from == null
                        ? 'Any start date'
                        : 'From ${shortDateLabel(from!)}',
                    color: Colors.white,
                    fontSize: 11,
                    onPressed: canFilter ? () => pickDay(start: true) : null,
                  ),
                  BrutalButton(
                    label: to == null
                        ? 'Any end date'
                        : 'Through ${shortDateLabel(to!)}',
                    color: Colors.white,
                    fontSize: 11,
                    onPressed: canFilter ? () => pickDay(start: false) : null,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              BrutalField(
                label: 'Exact amount ₹',
                controller: amount,
                enabled: canFilter,
                hint: '1250.50',
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                textInputAction: TextInputAction.search,
                onChanged: (_) => setState(() {}),
                onSubmitted: applyAmount,
                suffixIcon: IconButton(
                  onPressed: canFilter ? () => applyAmount(amount.text) : null,
                  icon: const Icon(Icons.search),
                  tooltip: 'Search by amount',
                ),
              ),
              if (amount.text.trim().isNotEmpty &&
                  parseRupeesToPaise(amount.text) == null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Enter a rupee amount like 1250 or 1250.50.',
                    style: FinStackType.caption.copyWith(
                      color: FinStackColors.onErrorContainer,
                    ),
                  ),
                ),
              if (filtered)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: BrutalButton(
                      label: 'Clear filters',
                      color: Colors.white,
                      fontSize: 11,
                      onPressed: busy ? null : clearFilters,
                    ),
                  ),
                ),
            ],
            if (feedback != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Semantics(liveRegion: true, child: Text(feedback!)),
              ),
            const SizedBox(height: 12),
            if (loading)
              const LinearProgressIndicator(
                semanticsLabel: 'Loading transactions',
              )
            else if (error != null)
              BrutalEmpty(
                icon: Icons.error_outline,
                message: error!,
                action: BrutalButton(label: 'Retry', onPressed: load),
              )
            else if (items.isEmpty)
              Text(
                linked
                    ? 'No linked transactions yet.${canManage ? ' Choose a purpose above to link an existing ledger entry.' : ''}'
                    : filtered
                    ? 'No unlinked transactions match these filters. Clear them to see everything available.'
                    : 'No matching transactions.',
              )
            else
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: row(item),
                ),
            if (!loading && (page > 1 || hasMore))
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: busy || page == 1
                        ? null
                        : () {
                            page--;
                            load();
                          },
                    icon: const Icon(Icons.chevron_left),
                    tooltip: 'Previous page',
                  ),
                  Text('Page $page'),
                  IconButton(
                    onPressed: busy || !hasMore
                        ? null
                        : () {
                            page++;
                            load();
                          },
                    icon: const Icon(Icons.chevron_right),
                    tooltip: 'Next page',
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
