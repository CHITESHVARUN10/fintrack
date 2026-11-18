/// A parsed UPI payment request from a scanned QR code.
class UpiPaymentRequest {
  final String raw;
  final String payeeVpa;
  final String payeeName;
  final int? amountPaise;
  final String? note;
  final String? merchantCode;
  final String? txnRef;

  const UpiPaymentRequest({
    required this.raw,
    required this.payeeVpa,
    required this.payeeName,
    this.amountPaise,
    this.note,
    this.merchantCode,
    this.txnRef,
  });

  bool get hasAmount => amountPaise != null && amountPaise! > 0;
  bool get isMerchant => merchantCode != null && merchantCode!.isNotEmpty;
}

final _vpaPattern = RegExp(r'^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,}@[a-zA-Z]{2,}$');

/// Accepts `upi://pay?...`, plain VPAs and EMVCo/Bharat QR payloads.
/// Returns null when the code is not a UPI payment code.
UpiPaymentRequest? parseUpiQr(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;

  if (value.contains('://')) {
    return _parseUri(value);
  }

  if (value.contains('@') && !value.contains('\n') && value.length < 120) {
    final vpa = value.split('&').first.trim();
    if (!_vpaPattern.hasMatch(vpa)) return null;
    return UpiPaymentRequest(
      raw: value,
      payeeVpa: vpa,
      payeeName: _prettyName(vpa),
    );
  }

  // EMVCo / Bharat QR (starts with the payload-format indicator 000201).
  if (value.startsWith('0002')) {
    return _parseEmv(value);
  }

  return null;
}

UpiPaymentRequest? _parseUri(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme.toLowerCase() != 'upi') return null;

  final params = <String, String>{};
  for (final entry in uri.queryParameters.entries) {
    params[entry.key.toLowerCase()] = entry.value;
  }

  var vpa = (params['pa'] ?? params['payeevpa'] ?? params['vpa'] ?? '').trim();
  if (vpa.isEmpty) {
    // Tolerate `upi://pay/merchant@bank` style payloads.
    for (final segment in uri.pathSegments) {
      if (segment.contains('@')) {
        vpa = segment.trim();
        break;
      }
    }
  }
  if (!_vpaPattern.hasMatch(vpa)) return null;

  final amount = _parseAmount(params['am'] ?? params['amount']);
  final name = (params['pn'] ?? params['payeename'] ?? '').trim();
  return UpiPaymentRequest(
    raw: raw,
    payeeVpa: vpa,
    payeeName: name.isEmpty ? _prettyName(vpa) : name,
    amountPaise: amount,
    note: _clean(params['tn'] ?? params['trxnote']),
    merchantCode: _clean(params['mc'] ?? params['mcc']),
    txnRef: _clean(params['tr'] ?? params['txnref']),
  );
}

UpiPaymentRequest? _parseEmv(String raw) {
  final root = _parseTlv(raw);
  if (root.isEmpty) return null;

  Map<String, String> merchant = {};
  for (var tag = 26; tag <= 51; tag++) {
    final key = tag.toString().padLeft(2, '0');
    final nested = root[key];
    if (nested == null || nested.isEmpty) continue;
    final parsed = _parseTlv(nested);
    final candidate = parsed['01'] ?? parsed['02'];
    if (candidate != null && candidate.contains('@')) {
      merchant = parsed;
      break;
    }
  }

  final vpa = (merchant['01'] ?? '').trim();
  if (!_vpaPattern.hasMatch(vpa)) return null;

  final name = _clean(merchant['02'] ?? root['59']) ?? _prettyName(vpa);
  final amount = _parseAmount(root['54']);
  return UpiPaymentRequest(
    raw: raw,
    payeeVpa: vpa,
    payeeName: name,
    amountPaise: amount,
    note: _clean(root['62']),
    merchantCode: _clean(merchant['03'] ?? root['52']),
  );
}

Map<String, String> _parseTlv(String data) {
  final out = <String, String>{};
  var i = 0;
  while (i + 4 <= data.length) {
    final id = data.substring(i, i + 2);
    final length = int.tryParse(data.substring(i + 2, i + 4));
    if (length == null) break;
    final start = i + 4;
    final end = start + length;
    if (end > data.length) break;
    out[id] = data.substring(start, end);
    i = end;
  }
  return out;
}

int? _parseAmount(String? raw) {
  if (raw == null) return null;
  final match = RegExp(r'([0-9]+(?:\.[0-9]{1,2})?)').firstMatch(raw.replaceAll(',', ''));
  if (match == null) return null;
  final value = double.tryParse(match.group(1)!);
  if (value == null || value <= 0) return null;
  return (value * 100).round();
}

String? _clean(String? value) {
  final v = value?.trim();
  return v == null || v.isEmpty ? null : v;
}

String _prettyName(String vpa) {
  final local = vpa.split('@').first;
  final words = local.replaceAll(RegExp(r'[._\-]+'), ' ').trim();
  if (words.isEmpty) return vpa;
  return words
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .map((w) => '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
}

/// Builds the intent every UPI app (GPay, PhonePe, Paytm, BHIM, bank apps)
/// understands. `am` is omitted when no amount was set.
Uri buildUpiUri({
  required String payeeVpa,
  required String payeeName,
  required int amountPaise,
  String? note,
  String? merchantCode,
  String? txnRef,
}) {
  final params = <String, String>{
    'pa': payeeVpa,
    'pn': payeeName,
    'am': (amountPaise / 100).toStringAsFixed(2),
    'cu': 'INR',
  };
  if (note != null && note.trim().isNotEmpty) params['tn'] = note.trim();
  if (merchantCode != null && merchantCode.trim().isNotEmpty) {
    params['mc'] = merchantCode.trim();
  }
  if (txnRef != null && txnRef.trim().isNotEmpty) params['tr'] = txnRef.trim();
  return Uri(scheme: 'upi', host: 'pay', queryParameters: params);
}
