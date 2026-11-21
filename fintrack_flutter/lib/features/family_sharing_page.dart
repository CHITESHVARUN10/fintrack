import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';

const _monthNames = [
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

String _monthLabel(String key) {
  final parts = key.split('-');
  if (parts.length != 2) return key;
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  if (year == null || month == null || month < 1 || month > 12) return key;
  return '${_monthNames[month - 1]} $year';
}

/// Per-member control for the months the family is allowed to see. A month is
/// hidden until the member explicitly shares it; PRIVATE transactions stay
/// hidden even inside a shared month.
class FamilySharingPage extends StatefulWidget {
  const FamilySharingPage({super.key});

  @override
  State<FamilySharingPage> createState() => _FamilySharingPageState();
}

class _FamilySharingPageState extends State<FamilySharingPage> {
  List<Map<String, dynamic>> _months = [];
  final _saving = <String>{};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.dio.get<Map>('/families/me/sharing');
      final rows = ((response.data?['months'] as List?) ?? []).whereType<Map>();
      if (!mounted) return;
      setState(() {
        _months = rows
            .map(
              (row) => <String, dynamic>{
                'month': '${row['month'] ?? ''}',
                'shared': row['shared'] == true,
                'count': (row['count'] as num?)?.toInt() ?? 0,
                'privateCount': (row['privateCount'] as num?)?.toInt() ?? 0,
              },
            )
            .where((row) => '${row['month']}'.isNotEmpty)
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(
        () => _error = ApiClient.errorMessage(
          error,
          'Could not load your sharing settings.',
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(Map<String, dynamic> row, bool value) async {
    final month = '${row['month']}';
    if (_saving.contains(month)) return;
    final previous = row['shared'] == true;
    setState(() {
      row['shared'] = value;
      _saving.add(month);
    });
    try {
      await ApiClient.dio.put(
        '/families/me/sharing/$month',
        data: {'shared': value},
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => row['shared'] = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ApiClient.errorMessage(
              error,
              'Could not update this month. Try again.',
            ),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving.remove(month));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
      children: [
        Text(
          'Choose which months your family can see.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        BrutalCard(
          color: FinStackColors.brandYellow,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('OFF BY DEFAULT', style: FinStackType.caption),
              const SizedBox(height: 6),
              const Text(
                'Every month starts private. Share a month to include its '
                'transactions in family activity, totals and statistics. '
                'Marking one transaction private keeps it hidden even after '
                'the month is shared.',
                style: TextStyle(fontSize: 12, height: 1.45),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_error != null)
          BrutalEmpty(
            message: _error!,
            action: TextButton(onPressed: _load, child: const Text('Retry')),
          )
        else if (_months.isEmpty)
          const BrutalEmpty(
            message:
                'No transactions yet. Once you add some, the month appears here.',
          )
        else
          for (final row in _months) ...[
            _monthCard(row),
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  Widget _monthCard(Map<String, dynamic> row) {
    final month = '${row['month']}';
    final shared = row['shared'] == true;
    final count = (row['count'] as num?)?.toInt() ?? 0;
    final privateCount = (row['privateCount'] as num?)?.toInt() ?? 0;
    final saving = _saving.contains(month);
    final detail = [
      count == 1 ? '1 transaction' : '$count transactions',
      if (privateCount > 0)
        privateCount == 1 ? '1 private' : '$privateCount private',
    ].join(' · ');
    return BrutalCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _monthLabel(month),
                  style: const TextStyle(
                    fontFamily: FinStackType.display,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  detail,
                  style: const TextStyle(
                    fontSize: 11,
                    color: FinStackColors.onSurfaceVariant,
                  ),
                ),
                if (shared) ...[
                  const SizedBox(height: 6),
                  BrutalTag(
                    label: 'Shared with family',
                    color: FinStackColors.accentGreen,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Switch(
            value: shared,
            onChanged: saving ? null : (value) => _toggle(row, value),
          ),
        ],
      ),
    );
  }
}
