// Extract readable names from bank statement UPI descriptions.
String readableVendorName(String original) {
  original = original.trim();
  if (!RegExp(r'^upi\s*/', caseSensitive: false).hasMatch(original)) {
    return original;
  }
  final parts = original.split('/').skip(1).map((part) => part.trim()).toList();
  while (parts.isNotEmpty &&
      const [
        '',
        'upi',
        'dr',
        'cr',
        'p2p',
        'p2m',
      ].contains(parts.first.toLowerCase())) {
    parts.removeAt(0);
  }
  final hasReference =
      parts.isNotEmpty && RegExp(r'^\d{6,}$').hasMatch(parts.first);
  if (hasReference) parts.removeAt(0);
  if (parts.isEmpty) return original;
  final name = parts.first;
  final bankOrPlaceholder = RegExp(
    r'^(?:[a-z]{4}0[a-z\d]{6}|(?:axis|hdfc|icici|idbi|kotak|sbi|pnb|bob|union|canara|yes|indusind|idfc)(?:\s+bank)?|bank(?:\s+of\b.*)?|payment|transfer|upi|unknown|na|n\.a\.)$',
    caseSensitive: false,
  );
  return RegExp(r'\p{L}{2}', unicode: true).hasMatch(name) &&
          !name.contains('@') &&
          !bankOrPlaceholder.hasMatch(name)
      ? name
      : original;
}

String transactionDisplayName(Map tx) {
  final resolved = tx['counterpartyName'];
  if (resolved is String && resolved.trim().isNotEmpty) {
    return readableVendorName(resolved.trim());
  }
  final sender = tx['sender'] as Map?;
  final recipient = tx['recipient'];
  final directory = tx['recipientVendorRef'];
  final useSender =
      tx['type'] == 'INCOME' &&
      [
        sender?['name'],
        sender?['upiId'],
      ].whereType<String>().any((text) => text.trim().isNotEmpty);
  final candidates = [
    if (useSender) ...[sender?['name'], sender?['upiId']],
    if (!useSender && directory is Map) directory['label'],
    if (recipient is Map) ...[recipient['name'], recipient['upiId']],
    if (recipient is String) recipient,
    tx['productName'],
    tx['category'],
  ];
  for (final label in candidates.whereType<String>()) {
    if (label.trim().isNotEmpty) return readableVendorName(label.trim());
  }
  return 'Transaction';
}

String transactionModeLabel(Object? mode) => switch (mode) {
  'UPI' => 'UPI',
  'BANK' => 'Bank',
  'CASH' => 'Cash',
  'CARD' => 'Card',
  _ => 'Other',
};
