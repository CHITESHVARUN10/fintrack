/// Indian number formatting shared by the mobile screens.
String inr(num value) {
  final rounded = value.round();
  final negative = rounded < 0;
  var digits = rounded.abs().toString();
  if (digits.length > 3) {
    final last3 = digits.substring(digits.length - 3);
    var rest = digits.substring(0, digits.length - 3);
    final groups = <String>[];
    while (rest.length > 2) {
      groups.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) groups.insert(0, rest);
    digits = '${groups.join(',')},$last3';
  }
  return '${negative ? '-' : ''}₹$digits';
}

/// Compact axis/centre values: ₹1.2L, ₹18k, ₹2.4Cr.
String compactInr(num value) {
  final n = value.abs();
  final sign = value < 0 ? '-' : '';
  if (n >= 10000000) {
    return '$sign₹${(n / 10000000).toStringAsFixed(n >= 100000000 ? 0 : 1)}Cr';
  }
  if (n >= 100000) {
    return '$sign₹${(n / 100000).toStringAsFixed(n >= 1000000 ? 0 : 1)}L';
  }
  if (n >= 1000) {
    return '$sign₹${(n / 1000).toStringAsFixed(n >= 10000 ? 0 : 1)}k';
  }
  return '$sign₹${n.round()}';
}

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// 20 Nov
String shortDateLabel(DateTime date) =>
    '${date.day} ${_months[date.month - 1]}';

/// 20 Nov 2026
String dateLabel(DateTime date) => '${shortDateLabel(date)} ${date.year}';

/// Nov 2026
String monthYearLabel(DateTime date) =>
    '${_months[date.month - 1]} ${date.year}';
