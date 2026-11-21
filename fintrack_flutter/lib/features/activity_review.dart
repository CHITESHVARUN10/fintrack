import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/ledger_categories.dart';
import '../core/vendor_name.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/confirm_action.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

String _rowSubtitle(Map row) {
  final date = DateTime.tryParse('${row['occurredAt'] ?? ''}')?.toLocal();
  return [
    if (date != null) numericDateLabel(date),
    transactionModeLabel(row['mode']),
    inrPaise((row['amountPaise'] as num?) ?? 0),
  ].join(' · ');
}

class ActivityReviewSheet extends StatefulWidget {
  const ActivityReviewSheet({
    super.key,
    required this.dateParams,
    required this.onChanged,
    required this.onOpenTransaction,
  });

  final Map<String, String> dateParams;
  final VoidCallback onChanged;
  final Future<void> Function(Map<String, dynamic>) onOpenTransaction;

  @override
  State<ActivityReviewSheet> createState() => _ActivityReviewSheetState();
}

class _ActivityReviewSheetState extends State<ActivityReviewSheet> {
  bool investments = true;
  int page = 1;
  int revision = 0;
  bool loading = true;
  bool busy = false;
  bool more = false;
  List<Map> items = [];
  final selected = <String>{};
  String? error;
  String? notice;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final current = ++revision;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await ApiClient.dio.get<Map>(
        investments
            ? '/transactions/investment-suggestions'
            : '/transactions/duplicate-groups',
        queryParameters: {
          ...widget.dateParams,
          if (investments) 'page': page else 'familyView': false,
        },
      );
      if (!mounted || current != revision) return;
      final data = response.data!;
      setState(() {
        items = ((data[investments ? 'items' : 'groups'] as List?) ?? [])
            .whereType<Map>()
            .toList();
        more = data['hasMore'] == true;
      });
    } catch (err) {
      if (!mounted || current != revision) return;
      setState(
        () => error = ApiClient.errorMessage(
          err,
          'Could not load the review. Try again.',
        ),
      );
    } finally {
      if (mounted && revision == current) setState(() => loading = false);
    }
  }

  Future<void> _apply(Future<void> Function() action, String success) async {
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await action();
      widget.onChanged();
      if (!mounted) return;
      setState(() {
        notice = success;
        selected.clear();
      });
      await load();
    } catch (err) {
      if (mounted) {
        setState(
          () =>
              error = ApiClient.errorMessage(err, 'Could not save the change.'),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _link(Map suggestion) => _apply(() async {
    final id = suggestion['transaction']['_id'];
    await ApiClient.dio.put(
      "/investments/${suggestion['investmentId']}/transactions/$id",
      data: {'role': suggestion['role']},
    );
  }, 'Investment transaction linked.');

  Future<void> _merge(List<String> ids) async {
    final confirmed = await confirmAction(
      context,
      title: 'Merge these duplicates?',
      message:
          'FinStack will keep one entry in Activity and retain the source records together.',
      action: 'Merge',
    );
    if (!confirmed || !mounted) return;
    await _apply(() async {
      final response = await ApiClient.dio.post<Map>(
        '/transactions/bulk-merge-duplicates',
        data: {'ids': ids},
      );
      if (response.data?['voided'] == 0) {
        throw StateError('No entries could be merged.');
      }
    }, 'Duplicates merged.');
  }

  Widget _suggestion(Map item) {
    final row = item['transaction'] as Map;
    final role = item['role'] == 'dividend' ? 'Dividend' : 'Stock purchase';
    return BrutalCard(
      shadow: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 6,
        children: [
          Text(
            transactionDisplayName(row),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          Text(_rowSubtitle(row), style: FinStackType.caption),
          Text("$role · ${item['name'] ?? 'Investment'}"),
          Align(
            alignment: Alignment.centerRight,
            child: BrutalButton(
              label: 'Link to investment',
              onPressed: busy ? null : () => _link(item),
            ),
          ),
        ],
      ),
    );
  }

  Widget _duplicateGroup(Map group) {
    final rows = ((group['items'] as List?) ?? []).whereType<Map>();
    final ids = rows
        .map((row) => '${row['_id']}')
        .where(selected.contains)
        .toList();
    return BrutalCard(
      shadow: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            group['reason'] == 'CANDIDATE_LINK'
                ? 'Possible duplicate'
                : 'Same amount and nearby dates',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          for (final row in rows)
            Row(
              children: [
                Expanded(
                  child: CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(transactionDisplayName(row)),
                    subtitle: Text(_rowSubtitle(row)),
                    value: selected.contains('${row['_id']}'),
                    onChanged: busy
                        ? null
                        : (checked) => setState(() {
                            if (checked == true) {
                              selected.add('${row['_id']}');
                            } else {
                              selected.remove('${row['_id']}');
                            }
                          }),
                  ),
                ),
                IconButton(
                  tooltip: 'Open transaction',
                  onPressed: busy
                      ? null
                      : () async {
                          await widget.onOpenTransaction(
                            Map<String, dynamic>.from(row),
                          );
                          if (mounted) await load();
                        },
                  icon: const Icon(Icons.open_in_new, size: 19),
                ),
              ],
            ),
          Align(
            alignment: Alignment.centerRight,
            child: BrutalButton(
              label: 'Merge selected',
              onPressed: busy || ids.length < 2 ? null : () => _merge(ids),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: .88,
    minChildSize: .55,
    maxChildSize: .98,
    builder: (_, scroll) => SafeArea(
      top: false,
      child: ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          const WorkspaceSheetTitle('Review transactions'),
          const SizedBox(height: 12),
          SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: true, label: Text('Investments')),
              ButtonSegment(value: false, label: Text('Duplicates')),
            ],
            selected: {investments},
            onSelectionChanged: busy
                ? null
                : (value) {
                    setState(() {
                      investments = value.first;
                      selected.clear();
                      page = 1;
                      notice = null;
                    });
                    load();
                  },
          ),
          const SizedBox(height: 12),
          Text(
            investments
                ? 'Review possible stock purchases and dividends based on entries you’ve already linked.'
                : 'Select entries that represent the same payment, or open a pending entry to keep it separate.',
          ),
          if (notice != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  notice!,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          const SizedBox(height: 12),
          if (loading)
            const LinearProgressIndicator(semanticsLabel: 'Loading review')
          else if (error != null)
            BrutalEmpty(
              icon: Icons.error_outline,
              message: error!,
              action: OutlinedButton(
                onPressed: load,
                child: const Text('Retry'),
              ),
            )
          else if (items.isEmpty)
            BrutalEmpty(
              message: investments
                  ? 'No investment matches on this page.'
                  : 'No possible duplicate groups in this period.',
            )
          else
            for (final item in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: investments ? _suggestion(item) : _duplicateGroup(item),
              ),
          if (investments && !loading && (page > 1 || more))
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: busy || page == 1
                      ? null
                      : () {
                          page--;
                          load();
                        },
                  child: const Text('Previous'),
                ),
                Text('Page $page'),
                TextButton(
                  onPressed: busy || !more
                      ? null
                      : () {
                          page++;
                          load();
                        },
                  child: const Text('Next'),
                ),
              ],
            ),
        ],
      ),
    ),
  );
}

class ActivityOffsetSheet extends StatefulWidget {
  const ActivityOffsetSheet({super.key, required this.transaction});

  final Map transaction;

  @override
  State<ActivityOffsetSheet> createState() => _ActivityOffsetSheetState();
}

class _ActivityOffsetSheetState extends State<ActivityOffsetSheet> {
  static const kinds = {
    'general': 'General offset',
    'purchase_on_behalf': 'Paid for someone',
    'loan_repayment': 'Loan repayment',
  };

  final purpose = TextEditingController();
  final search = TextEditingController();
  final minAmount = TextEditingController();
  final maxAmount = TextEditingController();
  final selected = <String, Map>{};
  List<Map> items = [];
  late String side = isIncoming(widget.transaction) ? 'outgoing' : 'incoming';
  String kind = 'general';
  String query = '';
  String category = '';
  String month = '';
  DateTime? fromDate;
  DateTime? toDate;
  bool filtersOpen = false;
  Timer? amountDebounce;
  int page = 1;
  int request = 0;
  bool more = false;
  bool loading = true;
  bool saving = false;
  String? loadError;
  String? saveError;

  String get base => "/transactions/${widget.transaction['_id']}";
  Iterable<Map> get entries => [widget.transaction, ...selected.values];
  int get incoming => sumSide(true);
  int get outgoing => sumSide(false);
  int get balance => incoming - outgoing;

  static bool isIncoming(Map row) => row['type'] == 'INCOME';

  int sumSide(bool credit) => entries
      .where((row) => isIncoming(row) == credit)
      .fold(
        0,
        (total, row) => total + ((row['amountPaise'] as num?)?.toInt() ?? 0),
      );

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    purpose.dispose();
    search.dispose();
    minAmount.dispose();
    maxAmount.dispose();
    amountDebounce?.cancel();
    super.dispose();
  }

  DateTime? get rangeFrom =>
      month.isNotEmpty ? _monthStart(month) : fromDate;
  DateTime? get rangeTo => month.isNotEmpty ? _monthEnd(month) : toDate;

  int get activeFilters => [
    category.isNotEmpty,
    month.isNotEmpty,
    fromDate != null || toDate != null,
    minAmount.text.trim().isNotEmpty || maxAmount.text.trim().isNotEmpty,
  ].where((active) => active).length;

  static DateTime _monthStart(String key) {
    final parts = key.split('-');
    return DateTime(int.parse(parts[0]), int.parse(parts[1]), 1);
  }

  static DateTime _monthEnd(String key) {
    final start = _monthStart(key);
    return DateTime(start.year, start.month + 1, 0);
  }

  static String _dateParam(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  static const _monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  List<MapEntry<String, String>> get monthOptions {
    final now = DateTime.now();
    return [
      for (var offset = 0; offset < 18; offset++)
        () {
          final date = DateTime(now.year, now.month - offset, 1);
          final key =
              '${date.year}-${date.month.toString().padLeft(2, '0')}';
          return MapEntry(
            key,
            '${_monthNames[date.month - 1]} ${date.year}',
          );
        }(),
    ];
  }

  void _resetPageAndLoad() {
    page = 1;
    load();
  }

  void _amountChanged() {
    amountDebounce?.cancel();
    amountDebounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      _resetPageAndLoad();
    });
  }

  Future<void> _pickDate({required bool from}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: (from ? fromDate : toDate) ?? DateTime.now(),
      firstDate: DateTime(2015),
      lastDate: DateTime.now(),
    );
    if (picked == null || !mounted) return;
    setState(() {
      month = '';
      if (from) {
        fromDate = picked;
      } else {
        toDate = picked;
      }
    });
    _resetPageAndLoad();
  }

  void _clearFilters() {
    amountDebounce?.cancel();
    search.clear();
    minAmount.clear();
    maxAmount.clear();
    setState(() {
      query = '';
      category = '';
      month = '';
      fromDate = null;
      toDate = null;
    });
    _resetPageAndLoad();
  }

  Future<void> load() async {
    final revision = ++request;
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final minPaise = parseRupeesToPaise(minAmount.text);
      final maxPaise = parseRupeesToPaise(maxAmount.text);
      final from = rangeFrom;
      final to = rangeTo;
      final response = await ApiClient.dio.get<Map>(
        '$base/offset-candidates',
        queryParameters: {
          'group': true,
          'page': page,
          if (side.isNotEmpty) 'side': side,
          if (query.isNotEmpty) 'q': query,
          if (category.isNotEmpty) 'category': category,
          'minAmountPaise': ?minPaise,
          'maxAmountPaise': ?maxPaise,
          if (from != null) 'from': _dateParam(from),
          if (to != null) 'to': _dateParam(to),
        },
      );
      if (!mounted || revision != request) return;
      setState(() {
        items = ((response.data?['items'] as List?) ?? [])
            .whereType<Map>()
            .toList();
        more = response.data?['hasMore'] == true;
      });
    } catch (err) {
      if (mounted && revision == request) {
        setState(
          () => loadError = ApiClient.errorMessage(
            err,
            'Could not find transactions.',
          ),
        );
      }
    } finally {
      if (mounted && revision == request) setState(() => loading = false);
    }
  }

  void toggle(Map row) {
    final id = '${row['_id']}';
    setState(() {
      if (selected.containsKey(id)) {
        selected.remove(id);
      } else if (selected.length < 29) {
        selected[id] = row;
      }
      saveError = null;
    });
  }

  Future<void> _save() async {
    if (selected.isEmpty || balance != 0 || saving) return;
    final text = purpose.text.trim();
    if (text.length > 120 || text.isEmpty) {
      setState(() => saveError = 'Enter a purpose of 1 to 120 characters.');
      return;
    }
    setState(() {
      saving = true;
      saveError = null;
    });
    try {
      await ApiClient.dio.put(
        '$base/offset',
        data: {
          if (selected.length == 1)
            'transactionId': selected.keys.single
          else
            'transactionIds': selected.keys.toList(),
          'purpose': text,
          if (kind != 'general') 'kind': kind,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (err) {
      if (mounted) {
        setState(
          () => saveError = ApiClient.errorMessage(
            err,
            'Could not save the offset.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget _amount(String title, int paise) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title),
        Text(inrPaise(paise), style: FinStackType.amount),
      ],
    ),
  );

  Widget _row(Map row, {bool fixed = false}) {
    final id = '${row['_id']}';
    final checked = selected.containsKey(id);
    return CheckboxListTile(
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
      value: fixed || checked,
      title: Text(transactionDisplayName(row)),
      subtitle: Text(
        "${isIncoming(row) ? 'Incoming' : 'Outgoing'} · ${_rowSubtitle(row)}",
      ),
      onChanged: fixed || saving || (!checked && selected.length == 29)
          ? null
          : (_) => toggle(row),
    );
  }

  @override
  Widget build(BuildContext context) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: .90,
    minChildSize: .60,
    maxChildSize: .98,
    builder: (_, scroll) => SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: scroll,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                children: [
                  const WorkspaceSheetTitle('Offset transactions'),
                  const SizedBox(height: 8),
                  const Text(
                    'Group payments that balance to zero. Every entry stays in Activity.',
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      for (final option in kinds.entries)
                        ChoiceChip(
                          label: Text(option.value),
                          selected: kind == option.key,
                          onSelected: saving
                              ? null
                              : (_) => setState(() {
                                  if (purpose.text.isEmpty ||
                                      purpose.text == kinds[kind]) {
                                    purpose.text = option.key == 'general'
                                        ? ''
                                        : option.value;
                                  }
                                  kind = option.key;
                                }),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  BrutalField(
                    label: 'Purpose',
                    controller: purpose,
                    hint: 'e.g. Dinner reimbursement',
                    enabled: !saving,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Selected entries',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  _row(widget.transaction, fixed: true),
                  for (final row in selected.values) _row(row),
                  const Divider(),
                  Text(
                    'Find transactions',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: '', label: Text('All')),
                      ButtonSegment(value: 'incoming', label: Text('Incoming')),
                      ButtonSegment(value: 'outgoing', label: Text('Outgoing')),
                    ],
                    selected: {side},
                    showSelectedIcon: false,
                    onSelectionChanged: saving
                        ? null
                        : (value) {
                            side = value.first;
                            page = 1;
                            load();
                          },
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: search,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (value) {
                      query = value.trim();
                      page = 1;
                      load();
                    },
                    decoration: InputDecoration(
                      labelText: 'Vendor, name or amount',
                      hintText: 'e.g. Corner Coffee or 1499',
                      suffixIcon: IconButton(
                        tooltip: 'Search transactions',
                        icon: const Icon(Icons.search),
                        onPressed: saving
                            ? null
                            : () {
                                query = search.text.trim();
                                page = 1;
                                load();
                              },
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: saving
                            ? null
                            : () => setState(
                                () => filtersOpen = !filtersOpen,
                              ),
                        icon: Icon(
                          filtersOpen ? Icons.expand_less : Icons.expand_more,
                          size: 18,
                        ),
                        label: Text(
                          activeFilters == 0
                              ? 'Filters'
                              : 'Filters ($activeFilters)',
                        ),
                      ),
                      if (activeFilters > 0 || query.isNotEmpty)
                        TextButton(
                          onPressed: saving ? null : _clearFilters,
                          child: const Text('Clear'),
                        ),
                    ],
                  ),
                  if (filtersOpen) ...[
                    const SizedBox(height: 2),
                    InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Category',
                        isDense: true,
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: category,
                          items: [
                            const DropdownMenuItem(
                              value: '',
                              child: Text('Any category'),
                            ),
                            for (final name in ledgerCategories)
                              DropdownMenuItem(
                                value: name,
                                child: Text(name),
                              ),
                          ],
                          onChanged: saving
                              ? null
                              : (value) {
                                  setState(() => category = value ?? '');
                                  _resetPageAndLoad();
                                },
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Month',
                        isDense: true,
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: month,
                          items: [
                            const DropdownMenuItem(
                              value: '',
                              child: Text('Any month'),
                            ),
                            for (final option in monthOptions)
                              DropdownMenuItem(
                                value: option.key,
                                child: Text(option.value),
                              ),
                          ],
                          onChanged: saving
                              ? null
                              : (value) {
                                  setState(() {
                                    month = value ?? '';
                                    if (month.isNotEmpty) {
                                      fromDate = null;
                                      toDate = null;
                                    }
                                  });
                                  _resetPageAndLoad();
                                },
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: saving
                                ? null
                                : () => _pickDate(from: true),
                            icon: const Icon(Icons.event, size: 16),
                            label: Text(
                              fromDate == null
                                  ? 'From date'
                                  : numericDateLabel(fromDate!),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: saving
                                ? null
                                : () => _pickDate(from: false),
                            icon: const Icon(Icons.event, size: 16),
                            label: Text(
                              toDate == null
                                  ? 'To date'
                                  : numericDateLabel(toDate!),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: minAmount,
                            enabled: !saving,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            onChanged: (_) => _amountChanged(),
                            decoration: const InputDecoration(
                              labelText: 'Min ₹',
                              isDense: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: maxAmount,
                            enabled: !saving,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            onChanged: (_) => _amountChanged(),
                            decoration: const InputDecoration(
                              labelText: 'Max ₹',
                              isDense: true,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (month.isNotEmpty || fromDate != null || toDate != null)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: saving
                              ? null
                              : () {
                                  setState(() {
                                    month = '';
                                    fromDate = null;
                                    toDate = null;
                                  });
                                  _resetPageAndLoad();
                                },
                          child: const Text('Clear dates'),
                        ),
                      ),
                  ],
                  const SizedBox(height: 8),
                  if (loading)
                    const LinearProgressIndicator(
                      semanticsLabel: 'Finding transactions',
                    )
                  else if (loadError != null)
                    BrutalEmpty(
                      message: loadError!,
                      action: TextButton(
                        onPressed: load,
                        child: const Text('Retry'),
                      ),
                    )
                  else if (items.isEmpty)
                    const ListTile(title: Text('No matching transactions'))
                  else
                    for (final row in items)
                      if (!selected.containsKey('${row['_id']}')) _row(row),
                  if (page > 1 || more)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        TextButton(
                          onPressed: saving || loading || page == 1
                              ? null
                              : () {
                                  page--;
                                  load();
                                },
                          child: const Text('Previous'),
                        ),
                        Text('Page $page'),
                        TextButton(
                          onPressed: saving || loading || !more
                              ? null
                              : () {
                                  page++;
                                  load();
                                },
                          child: const Text('Next'),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 6,
                children: [
                  const Divider(height: 1),
                  Row(
                    children: [
                      _amount('Incoming', incoming),
                      _amount('Outgoing', outgoing),
                    ],
                  ),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      saveError ??
                          (balance == 0
                              ? 'Balanced · ${selected.length + 1} entries'
                              : '${inrPaise(balance.abs())} more ${balance > 0 ? 'outgoing' : 'incoming'} needed'),
                      style: TextStyle(
                        color: saveError == null
                            ? FinStackColors.onSurface
                            : FinStackColors.onErrorContainer,
                      ),
                    ),
                  ),
                  BrutalButton(
                    label: saving
                        ? 'Saving…'
                        : selected.length > 1
                        ? 'Save offset group'
                        : 'Save offset pair',
                    onPressed: saving || balance != 0 || selected.isEmpty
                        ? null
                        : _save,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
