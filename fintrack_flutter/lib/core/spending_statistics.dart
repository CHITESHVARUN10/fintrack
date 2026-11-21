import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart' show DateTimeRange, DateUtils;

import 'api_client.dart';
import 'vendor_name.dart';

enum SpendingPeriod { today, month, custom }

DateTime _offset(DateTime date, int days) =>
    DateTime(date.year, date.month, date.day + days);

int _daysBetween(DateTime start, DateTime end) => DateTime.utc(
  end.year,
  end.month,
  end.day,
).difference(DateTime.utc(start.year, start.month, start.day)).inDays;

({DateTimeRange current, DateTimeRange previous}) spendingRanges({
  required SpendingPeriod period,
  required DateTime now,
  required DateTime month,
  DateTimeRange? custom,
}) {
  final today = DateUtils.dateOnly(now);
  if (period == SpendingPeriod.month) {
    final start = DateTime(month.year, month.month);
    final monthEnd = DateTime(month.year, month.month + 1, 0);
    final monthToDate = !today.isBefore(start) && !today.isAfter(monthEnd);
    final priorStart = DateTime(month.year, month.month - 1);
    final priorEnd = DateTime(month.year, month.month, 0);
    final priorCutoff = monthToDate
        ? DateTime(priorStart.year, priorStart.month, today.day)
        : today;
    return (
      current: DateTimeRange(start: start, end: monthToDate ? today : monthEnd),
      previous: DateTimeRange(
        start: priorStart,
        end: priorCutoff.isBefore(priorEnd) && !priorCutoff.isBefore(priorStart)
            ? priorCutoff
            : priorEnd,
      ),
    );
  }
  final current = period == SpendingPeriod.custom
      ? custom!
      : DateTimeRange(start: today, end: today);
  return (
    current: current,
    previous: DateTimeRange(
      start: _offset(
        current.start,
        -(_daysBetween(current.start, current.end) + 1),
      ),
      end: _offset(current.start, -1),
    ),
  );
}

typedef SpendingEntry = ({String label, double value});
typedef SpendingBucket = ({DateTime start, DateTime end, int paise});
typedef SpendingChange = ({String label, int current, int previous});

class SpendingStatistics {
  SpendingStatistics._(this._current, this._previous);

  final List<_Expense> _current;
  final List<_Expense> _previous;

  static Future<SpendingStatistics> load(
    ({DateTimeRange current, DateTimeRange previous}) ranges,
    CancelToken token,
  ) async {
    // The comparison period ends before the current one starts. A single
    // paginated query also keeps the vendor labels consistent across both.
    final rows = await _expenses(
      ranges.previous.start,
      ranges.current.end,
      token,
    );
    if (rows.isEmpty) return SpendingStatistics._([], []);
    final directory = await _vendors(token);
    final current = <_Expense>[];
    final previous = <_Expense>[];
    for (final row in rows) {
      final expense = _Expense.parse(row, directory);
      if (expense == null) continue;
      if (!expense.date.isBefore(ranges.current.start) &&
          !expense.date.isAfter(ranges.current.end)) {
        current.add(expense);
      } else if (!expense.date.isBefore(ranges.previous.start) &&
          !expense.date.isAfter(ranges.previous.end)) {
        previous.add(expense);
      }
    }
    return SpendingStatistics._(current, previous);
  }

  List<String> options({required bool byVendor}) {
    final names = <String, String>{};
    for (final expense in [..._current, ..._previous]) {
      final labels = byVendor
          ? [expense.vendor]
          : expense.categories.map((item) => item.label);
      for (final label in labels) {
        names.putIfAbsent(_key(label), () => label);
      }
    }
    return names.values.toList()..sort((a, b) => _key(a).compareTo(_key(b)));
  }

  SpendingView filter({
    required DateTimeRange range,
    String? category,
    String? vendor,
  }) {
    final categoryKey = category == null ? null : _key(category);
    final vendorKey = vendor == null ? null : _key(vendor);
    _Totals summarize(List<_Expense> expenses) {
      final totals = _Totals();
      for (final expense in expenses) {
        if (vendorKey != null && _key(expense.vendor) != vendorKey) continue;
        var amount = 0;
        for (final item in expense.categories) {
          if (categoryKey != null && _key(item.label) != categoryKey) continue;
          totals.add(totals.categories, item.label, item.paise);
          amount += item.paise;
        }
        if (amount == 0) continue;
        totals.add(totals.vendors, expense.vendor, amount);
        totals.byDay.update(
          expense.date,
          (paise) => paise + amount,
          ifAbsent: () => amount,
        );
        totals.paise += amount;
        totals.count++;
      }
      return totals;
    }

    return SpendingView._(range, summarize(_current), summarize(_previous));
  }
}

class SpendingView {
  SpendingView._(this.range, this._current, this._previous);

  final DateTimeRange range;
  final _Totals _current;
  final _Totals _previous;

  int get currentPaise => _current.paise;
  int get previousPaise => _previous.paise;
  int get count => _current.count;

  late final List<SpendingBucket> buckets = _buildBuckets();

  List<SpendingBucket> _buildBuckets() {
    final days = _daysBetween(range.start, range.end) + 1;
    final step = days <= 31 ? 1 : math.max(7, (days / 24).ceil());
    final totals = List<int>.filled((days / step).ceil(), 0);
    for (final entry in _current.byDay.entries) {
      totals[_daysBetween(range.start, entry.key) ~/ step] += entry.value;
    }
    return [
      for (var i = 0; i < totals.length; i++)
        (
          start: _offset(range.start, i * step),
          end: _offset(range.start, math.min(days, (i + 1) * step) - 1),
          paise: totals[i],
        ),
    ];
  }

  List<SpendingEntry> breakdown({required bool byVendor}) {
    final groups =
        (byVendor ? _current.vendors : _current.categories).values.toList()
          ..sort((a, b) {
            final amount = b.paise.compareTo(a.paise);
            return amount == 0
                ? _key(a.label).compareTo(_key(b.label))
                : amount;
          });
    return [
      for (final row in groups.take(groups.length > 8 ? 7 : 8))
        (label: row.label, value: row.paise / 100),
      if (groups.length > 8)
        (
          label: byVendor ? 'Remaining vendors' : 'Remaining categories',
          value:
              groups.skip(7).fold<int>(0, (sum, row) => sum + row.paise) / 100,
        ),
    ];
  }

  List<SpendingChange> changes({required bool byVendor}) {
    final current = byVendor ? _current.vendors : _current.categories;
    final previous = byVendor ? _previous.vendors : _previous.categories;
    return [
      for (final key in {...current.keys, ...previous.keys})
        (
          label: current[key]?.label ?? previous[key]!.label,
          current: current[key]?.paise ?? 0,
          previous: previous[key]?.paise ?? 0,
        ),
    ]..sort((a, b) {
      final change = (b.current - b.previous).abs().compareTo(
        (a.current - a.previous).abs(),
      );
      return change == 0 ? _key(a.label).compareTo(_key(b.label)) : change;
    });
  }
}

typedef _Amount = ({String label, int paise});

class _Totals {
  int paise = 0;
  int count = 0;
  final byDay = <DateTime, int>{};
  final categories = <String, _Amount>{};
  final vendors = <String, _Amount>{};

  void add(Map<String, _Amount> groups, String label, int amount) {
    final key = _key(label);
    final original = groups[key];
    groups[key] = (
      label: original?.label ?? label,
      paise: (original?.paise ?? 0) + amount,
    );
  }
}

class _Expense {
  _Expense(this.date, this.vendor, this.categories);

  final DateTime date;
  final String vendor;
  final List<_Amount> categories;

  static _Expense? parse(Map row, _VendorDirectory directory) {
    final paise = _paise(row['amountPaise']);
    final date = DateTime.tryParse(_text(row['occurredAt']))?.toLocal();
    if (date == null || paise <= 0) return null;
    final fallback = _text(row['category'], 'Uncategorized');
    // Explicit allocations take priority. A remaining amount belongs to the
    // transaction's category, and inconsistent item totals cannot inflate spend.
    final split = _allocations(row['categorySplit'], fallback);
    final items = split.isEmpty
        ? _allocations(row['lineItems'], fallback)
        : split;
    final allocated = items.fold<int>(0, (sum, item) => sum + item.paise);
    final categories = allocated > paise
        ? [(label: fallback, paise: paise)]
        : [
            ...items,
            if (allocated < paise) (label: fallback, paise: paise - allocated),
          ];

    final recipient = row['recipient'];
    final name = _text(recipient is Map ? recipient['name'] : null);
    final address = _text(
      recipient is Map ? recipient['upiId'] : null,
      _text(row['upiId'], _upiIn(name)),
    );
    final vendor = directory.label(
      reference: _text(row['recipientVendorRef']),
      name: name,
      address: address,
    );
    return _Expense(DateUtils.dateOnly(date), vendor, categories);
  }
}

List<_Amount> _allocations(Object? raw, String fallback) => [
  if (raw is List)
    for (final item in raw.whereType<Map>())
      if (_paise(item['amountPaise']) > 0)
        (
          label: _text(item['category'], fallback),
          paise: _paise(item['amountPaise']),
        ),
];

String _text(Object? value, [String fallback = '']) =>
    value is String && value.trim().isNotEmpty ? value.trim() : fallback;

int _paise(Object? value) {
  final number = value is num ? value : num.tryParse(_text(value));
  return number != null && number.isFinite ? number.round() : 0;
}

String _key(String label) =>
    label.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
final _upiPattern = RegExp(r'^[^\s/@]+@[^\s/@]+$');

String _upiIn(String name) => name
    .split('/')
    .map((part) => part.trim())
    .firstWhere(_upiPattern.hasMatch, orElse: () => '');

class _VendorDirectory {
  final byId = <String, String>{};
  final byAddress = <String, String>{};

  void add(Map row) {
    final label = _text(row['label']);
    if (label.isEmpty) return;
    final clean = readableVendorName(label);
    if (clean.toLowerCase().startsWith('upi/') || _upiPattern.hasMatch(clean)) {
      return;
    }
    final id = _text(row['_id'], _text(row['id']));
    if (id.isNotEmpty) byId[id] = clean;
    final address = _text(row['upiId']).toLowerCase();
    if (address.isNotEmpty) byAddress[address] = clean;
  }

  String label({
    required String reference,
    required String name,
    required String address,
  }) =>
      byId[reference] ??
      byAddress[address.toLowerCase()] ??
      readableVendorName(_text(name, _text(address, 'Unknown vendor')));
}

const _pageSize = 200;

Future<List<Map>> _expenses(
  DateTime start,
  DateTime end,
  CancelToken token,
) async {
  final rows = <Map>[];
  final seen = <String>{};
  for (var page = 1; ; page++) {
    final response = await ApiClient.dio.get(
      '/transactions',
      queryParameters: {
        'familyView': false,
        'from': start.toUtc().toIso8601String(),
        'to': _offset(
          end,
          1,
        ).subtract(const Duration(milliseconds: 1)).toUtc().toIso8601String(),
        'page': page,
        'limit': _pageSize,
      },
      cancelToken: token,
    );
    final data = response.data as Map;
    final items = data['items'] as List;
    for (final row in items.whereType<Map>()) {
      final id = _text(row['_id'], _text(row['id']));
      if (row['status'] != 'VOIDED' &&
          row['isOffset'] != true &&
          const {'EXPENSE', 'CASH_EXPENSE'}.contains(row['type']) &&
          (id.isEmpty || seen.add(id))) {
        rows.add(row);
      }
    }
    if (items.isEmpty || data['hasMore'] != true) return rows;
  }
}

Future<_VendorDirectory> _vendors(CancelToken token) async {
  final directory = _VendorDirectory();
  try {
    for (var skip = 0; ; skip += _pageSize) {
      final response = await ApiClient.dio.get(
        '/recipients',
        queryParameters: {
          'limit': _pageSize,
          'skip': skip,
          'includeArchived': true,
        },
        cancelToken: token,
      );
      final data = response.data;
      final items = (data is Map ? data['items'] : data) as List? ?? [];
      for (final row in items.whereType<Map>()) {
        directory.add(row);
      }
      if (items.length < _pageSize) break;
    }
  } on DioException catch (error) {
    if (CancelToken.isCancel(error)) rethrow;
    // Transaction descriptions are still available when the directory fails.
    return _VendorDirectory();
  }
  return directory;
}
