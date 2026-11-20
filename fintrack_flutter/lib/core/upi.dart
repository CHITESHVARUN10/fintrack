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
  Uri? get paymentUri => _canonicalPaymentUri(raw);
  bool get isSigned =>
      paymentUri?.queryParameters.keys.any(
        (key) => key.toLowerCase() == 'sign',
      ) ??
      false;
}

final _vpaPattern = RegExp(r'^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,}@[a-zA-Z]{2,}$');

/// Accepts `upi://pay?...`, plain VPAs and EMVCo/Bharat QR payloads.
/// Returns null when the code is not a UPI payment code.
UpiPaymentRequest? parseUpiQr(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;

  if (value.contains('://')) {
    try {
      return _parseUri(value);
    } on FormatException {
      return null;
    }
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

Uri? _canonicalPaymentUri(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null ||
      uri.scheme != 'upi' ||
      uri.host != 'pay' ||
      (uri.path.isNotEmpty && uri.path != '/') ||
      uri.hasFragment ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort) {
    return null;
  }
  if (!uri.queryParameters.containsKey('pa')) return null;
  return uri;
}

UpiPaymentRequest? _parseUri(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null ||
      uri.scheme != 'upi' ||
      uri.host != 'pay' ||
      uri.hasFragment ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort) {
    return null;
  }
  final params = <String, String>{};
  for (final entry in uri.queryParametersAll.entries) {
    final key = entry.key.toLowerCase();
    if (const {'pa', 'am', 'cu', 'sign'}.contains(key) &&
        (params.containsKey(key) || entry.value.length != 1)) {
      return null;
    }
    params[key] = entry.value.last;
  }

  if (params['cu'] != null && params['cu']!.toUpperCase() != 'INR') return null;
  if (params.containsKey('sign') && _canonicalPaymentUri(raw) == null) {
    return null;
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
  if (params.containsKey('sign') &&
      params['am']?.isNotEmpty == true &&
      amount == null &&
      num.tryParse(params['am']!) != 0) {
    return null;
  }
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
  final match = RegExp(
    r'^([0-9]+(?:\.[0-9]{1,2})?)$',
  ).firstMatch(raw.trim().replaceAll(',', ''));
  if (match == null) return null;
  final value = double.tryParse(match.group(1)!);
  if (value == null || !value.isFinite || value <= 0) return null;
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

/// A UPI app the payment intent can be handed to.
///
/// iOS always routes `upi://` to whichever app claimed the scheme, which is
/// how a payment ended up inside WhatsApp. Each app also registers its own
/// scheme, so listing those lets the user pick an app once and reuse it.
class UpiApp {
  final String id;
  final String label;
  final String probeScheme;
  final String androidPackage;

  const UpiApp({
    required this.id,
    required this.label,
    required this.probeScheme,
    required this.androidPackage,
  });
}

const upiApps = <UpiApp>[
  UpiApp(
    id: 'gpay',
    label: 'Google Pay',
    probeScheme: 'tez',
    androidPackage: 'com.google.android.apps.nbu.paisa.user',
  ),
  UpiApp(
    id: 'phonepe',
    label: 'PhonePe',
    probeScheme: 'phonepe',
    androidPackage: 'com.phonepe.app',
  ),
  UpiApp(
    id: 'paytm',
    label: 'Paytm',
    probeScheme: 'paytmmp',
    androidPackage: 'net.one97.paytm',
  ),
  UpiApp(
    id: 'bhim',
    label: 'BHIM',
    probeScheme: 'bhim',
    androidPackage: 'in.org.npci.upiapp',
  ),
  UpiApp(
    id: 'any',
    label: 'Any other UPI app',
    probeScheme: 'upi',
    androidPackage: '',
  ),
];

UpiApp? upiAppById(String? id) {
  if (id == null) return null;
  for (final app in upiApps) {
    if (app.id == id) return app;
  }
  return null;
}

/// Keeps the encoded query from a scanned payment link in its original order.
String buildScannedUpiLink(
  UpiPaymentRequest request, {
  required int amountPaise,
  String? appId,
}) {
  final original = request.paymentUri;
  if (original == null) {
    return buildUpiUri(
      payeeVpa: request.payeeVpa,
      payeeName: request.payeeName,
      amountPaise: amountPaise,
      note: request.note,
      merchantCode: request.merchantCode,
      txnRef: request.txnRef,
      appId: appId,
    ).toString();
  }

  var query = request.raw.substring(request.raw.indexOf('?') + 1);
  if (!request.isSigned && request.amountPaise != amountPaise) {
    // Keep all other values as encoded by the issuer, including repeated keys.
    query = [
      for (final part in query.split('&'))
        if (Uri.decodeQueryComponent(part.split('=').first).toLowerCase() !=
            'am')
          part,
      'am=${_intentAmount(amountPaise)}',
    ].join('&');
  }
  return '${_upiTarget(appId)}?$query';
}

String _intentAmount(int paise) => (paise / 100).toStringAsFixed(2);

String _upiTarget(String? appId) => switch (appId) {
  'gpay' => 'gpay://upi/pay',
  'tez' => 'tez://upi/pay',
  'phonepe' => 'phonepe://pay',
  'phonepeLegacy' => 'phonepe://upi/pay',
  'paytm' => 'paytmmp://pay',
  'bhim' => 'bhim://pay',
  _ => 'upi://pay',
};

/// Builds a UPI payment link for sources without a canonical payment URI.
Uri buildUpiUri({
  required String payeeVpa,
  required String payeeName,
  required int amountPaise,
  String? note,
  String? merchantCode,
  String? txnRef,
  String? appId,
}) {
  final params = <String, String>{
    'pa': payeeVpa,
    'pn': payeeName,
    'am': _intentAmount(amountPaise),
    'cu': 'INR',
    if (note != null && note.trim().isNotEmpty) 'tn': note.trim(),
    if (merchantCode != null && merchantCode.trim().isNotEmpty)
      'mc': merchantCode.trim(),
    if (txnRef != null && txnRef.trim().isNotEmpty) 'tr': txnRef.trim(),
  };
  final query = params.entries
      .map((entry) => '${entry.key}=${Uri.encodeComponent(entry.value)}')
      .join('&');
  return Uri.parse('${_upiTarget(appId)}?$query');
}
