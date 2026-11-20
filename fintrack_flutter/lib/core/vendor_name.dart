// Extract readable names from bank statement UPI descriptions.
String readableVendorName(String original) {
  if (!RegExp(r'^upi\s*/', caseSensitive: false).hasMatch(original)) {
    return original;
  }
  final parts = original.split('/').skip(1).map((part) => part.trim()).toList();
  if (const ['dr', 'cr', 'p2p', 'p2m'].contains(parts.first.toLowerCase())) {
    parts.removeAt(0);
  }
  final hasReference =
      parts.isNotEmpty && RegExp(r'^\d{6,}$').hasMatch(parts.first);
  if (hasReference) parts.removeAt(0);
  if (parts.isEmpty || (parts.length < 2 && !hasReference)) return original;
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
