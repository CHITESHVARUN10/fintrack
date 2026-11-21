import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
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
  final selected = <String, Map>{};
  List<Map> items = [];
  late String side = isIncoming(widget.transaction) ? 'outgoing' : 'incoming';
  String kind = 'general';
  String query = '';
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
    super.dispose();
  }

  Future<void> load() async {
    final revision = ++request;
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final response = await ApiClient.dio.get<Map>(
        '$base/offset-candidates',
        queryParameters: {
          'group': true,
          'page': page,
          if (side.isNotEmpty) 'side': side,
          if (query.isNotEmpty) 'q': query,
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
                      labelText: 'Name or amount',
                      hintText: 'e.g. 1499',
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
