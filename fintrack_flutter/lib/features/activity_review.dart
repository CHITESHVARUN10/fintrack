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
  final purpose = TextEditingController();
  List<Map> items = [];
  Map? selected;
  int page = 1;
  bool more = false;
  bool loading = true;
  bool saving = false;
  String? error;

  String get base => "/transactions/${widget.transaction['_id']}";

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    purpose.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await ApiClient.dio.get<Map>(
        '$base/offset-candidates',
        queryParameters: {'page': page},
      );
      if (!mounted) return;
      setState(() {
        items = ((response.data?['items'] as List?) ?? [])
            .whereType<Map>()
            .toList();
        more = response.data?['hasMore'] == true;
      });
    } catch (err) {
      if (mounted) {
        setState(
          () => error = ApiClient.errorMessage(
            err,
            'Could not find matching transactions.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _save() async {
    final text = purpose.text.trim();
    if (text.isEmpty || text.length > 120) {
      setState(() => error = 'Enter a purpose of 1 to 120 characters.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await ApiClient.dio.put(
        '$base/offset',
        data: {'transactionId': selected!['_id'], 'purpose': text},
      );
      if (mounted) Navigator.pop(context, true);
    } catch (err) {
      if (mounted) {
        setState(
          () => error = ApiClient.errorMessage(
            err,
            'Could not save the offset pair.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: .86,
    minChildSize: .52,
    maxChildSize: .98,
    builder: (_, scroll) => SafeArea(
      top: false,
      child: ListView(
        controller: scroll,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          28 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        children: [
          const WorkspaceSheetTitle('Offset transaction'),
          Text(
            transactionDisplayName(widget.transaction),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          Text(_rowSubtitle(widget.transaction), style: FinStackType.caption),
          const SizedBox(height: 12),
          Text(
            widget.transaction['type'] == 'INCOME'
                ? 'Choose the outgoing payment that this credit covered.'
                : 'Choose the incoming payment that covered this debit.',
          ),
          const SizedBox(height: 12),
          if (loading)
            const LinearProgressIndicator(
              semanticsLabel: 'Finding matching entries',
            )
          else if (items.isEmpty)
            BrutalEmpty(
              message:
                  error ??
                  'No settled transaction with the same amount was found.',
              action: error == null
                  ? null
                  : OutlinedButton(onPressed: load, child: const Text('Retry')),
            )
          else ...[
            for (final row in items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                selected: row['_id'] == selected?['_id'],
                title: Text(transactionDisplayName(row)),
                subtitle: Text(_rowSubtitle(row)),
                leading: Icon(
                  row['_id'] == selected?['_id']
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                ),
                onTap: saving
                    ? null
                    : () => setState(() {
                        selected = row;
                        error = null;
                      }),
              ),
            if (page > 1 || more)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: saving || page == 1
                        ? null
                        : () {
                            page--;
                            selected = null;
                            load();
                          },
                    child: const Text('Previous'),
                  ),
                  Text('Page $page'),
                  TextButton(
                    onPressed: saving || !more
                        ? null
                        : () {
                            page++;
                            selected = null;
                            load();
                          },
                    child: const Text('Next'),
                  ),
                ],
              ),
            if (selected != null) ...[
              BrutalField(
                label: 'Purpose',
                controller: purpose,
                hint: 'e.g. Dinner reimbursement',
                enabled: !saving,
              ),
              const SizedBox(height: 10),
              const Text(
                'Both entries stay in Activity. Spending and income totals exclude the pair.',
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Semantics(liveRegion: true, child: Text(error!)),
                ),
              const SizedBox(height: 12),
              BrutalButton(
                label: saving ? 'Saving…' : 'Save offset pair',
                onPressed: saving ? null : _save,
              ),
            ],
          ],
        ],
      ),
    ),
  );
}
