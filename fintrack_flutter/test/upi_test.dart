import 'package:flutter_test/flutter_test.dart';
import 'package:fintrack_flutter/core/upi.dart';

String tlv(String id, String value) =>
    '$id${value.length.toString().padLeft(2, '0')}$value';

void main() {
  group('parseUpiQr', () {
    test('reads a standard UPI payment URI', () {
      final qr =
          'upi://pay?pa=merchant@okhdfcbank&pn=Corner%20Store&am=250.50&cu=INR&tn=Groceries&mc=5411&tr=TX123';
      final parsed = parseUpiQr(qr);
      expect(parsed, isNotNull);
      expect(parsed!.payeeVpa, 'merchant@okhdfcbank');
      expect(parsed.payeeName, 'Corner Store');
      expect(parsed.amountPaise, 25050);
      expect(parsed.note, 'Groceries');
      expect(parsed.merchantCode, '5411');
      expect(parsed.txnRef, 'TX123');
      expect(parsed.hasAmount, isTrue);
    });

    test('leaves amount empty when the QR has none', () {
      final parsed = parseUpiQr('upi://pay?pa=shop@ybl&pn=Shop&cu=INR');
      expect(parsed, isNotNull);
      expect(parsed!.amountPaise, isNull);
      expect(parsed.hasAmount, isFalse);
      expect(parsed.payeeName, 'Shop');
    });

    test('accepts a plain UPI ID', () {
      final parsed = parseUpiQr('chai.wala@paytm');
      expect(parsed, isNotNull);
      expect(parsed!.payeeVpa, 'chai.wala@paytm');
      expect(parsed.payeeName, 'Chai Wala');
      expect(parsed.amountPaise, isNull);
    });

    test('handles amount with thousands separator', () {
      final parsed = parseUpiQr(
        'upi://pay?pa=store@okaxis&am=1%2C250.00&cu=INR',
      );
      expect(parsed, isNotNull);
      expect(parsed!.amountPaise, 125000);
    });

    test('parses an EMVCo / Bharat QR payload', () {
      final merchant =
          tlv('00', 'com.upi') +
          tlv('01', 'merchant@okhdfcbank') +
          tlv('02', 'Corner Store') +
          tlv('03', '5411');
      final emv =
          tlv('00', '01') +
          tlv('01', '12') +
          tlv('26', merchant) +
          tlv('52', '5411') +
          tlv('53', '356') +
          tlv('54', '99.00') +
          tlv('58', 'IN') +
          tlv('59', 'Corner Store') +
          tlv('60', 'Mumbai') +
          tlv('63', 'ABCD');
      final parsed = parseUpiQr(emv);
      expect(parsed, isNotNull);
      expect(parsed!.payeeVpa, 'merchant@okhdfcbank');
      expect(parsed.payeeName, 'Corner Store');
      expect(parsed.amountPaise, 9900);
      expect(parsed.merchantCode, '5411');
    });

    test('rejects unrelated QR content', () {
      expect(parseUpiQr('https://example.com/promo'), isNull);
      expect(parseUpiQr('hello world'), isNull);
      expect(parseUpiQr('upi://pay?pa=not-a-vpa'), isNull);
    });
  });

  group('scanned payment handoff', () {
    test('preserves the entire encoded signed query for all payment apps', () {
      const query =
          'pa=store%40upi&pn=Corner%20Store&cu=INR&am=25&mc=5411'
          '&tr=ORDER123&tid=TX1&mode=02&orgid=000000&mid=123&url=https%3A%2F%2Fexample.com'
          '&signatureExtension=%41&sign=abc%2Bdef%3D';
      final request = parseUpiQr('upi://pay?$query')!;
      expect(request.isSigned, isTrue);
      const targets = {
        'bhim': 'bhim://pay',
        'gpay': 'gpay://upi/pay',
        'tez': 'tez://upi/pay',
        'paytm': 'paytmmp://pay',
        'phonepe': 'phonepe://pay',
        'any': 'upi://pay',
      };
      for (final target in targets.entries) {
        expect(
          buildScannedUpiLink(request, amountPaise: 9999, appId: target.key),
          '${target.value}?$query',
        );
      }
    });

    test('keeps a signed variable-amount QR intact', () {
      const raw = 'upi://pay?pa=store@upi&pn=Store&am=0&sign=example';
      final request = parseUpiQr(raw)!;
      expect(request.hasAmount, isFalse);
      expect(buildScannedUpiLink(request, amountPaise: 1250), raw);
    });

    test('adds an amount without rebuilding an unsigned QR', () {
      const raw = 'upi://pay?pa=store@upi&pn=Store&am=0&mode=01&orgid=000000';
      final link = buildScannedUpiLink(parseUpiQr(raw)!, amountPaise: 1250);
      expect(
        link,
        'upi://pay?pa=store@upi&pn=Store&mode=01&orgid=000000&am=12.50',
      );
    });

    test(
      'rejects ambiguous payees, duplicate amounts and non-payment links',
      () {
        expect(parseUpiQr('upi://mandate?pa=store@upi'), isNull);
        expect(parseUpiQr('upi://pay?pa=store@upi&pa=other@upi'), isNull);
        expect(parseUpiQr('upi://pay?pa=store@upi&am=10&am=20'), isNull);
        expect(parseUpiQr('upi://pay?pa=store@upi&cu=USD'), isNull);
      },
    );
  });

  group('buildUpiUri', () {
    test('builds the intent every UPI app understands', () {
      final uri = buildUpiUri(
        payeeVpa: 'merchant@okhdfcbank',
        payeeName: 'Corner Store',
        amountPaise: 25050,
        note: 'Groceries',
        merchantCode: '5411',
      );
      expect(uri.scheme, 'upi');
      expect(uri.host, 'pay');
      expect(uri.queryParameters['pa'], 'merchant@okhdfcbank');
      expect(uri.queryParameters['pn'], 'Corner Store');
      expect(uri.queryParameters['am'], '250.50');
      expect(uri.queryParameters['cu'], 'INR');
      expect(uri.queryParameters['tn'], 'Groceries');
      expect(uri.queryParameters['mc'], '5411');
    });

    test('targets a specific app when one is chosen', () {
      Uri forApp(String? appId) => buildUpiUri(
        payeeVpa: 'merchant@okhdfcbank',
        payeeName: 'Corner Store',
        amountPaise: 25050,
        appId: appId,
      );

      final gpay = forApp('gpay');
      expect(gpay.scheme, 'gpay');
      expect(gpay.host, 'upi');
      expect(gpay.path, '/pay');

      final paytm = forApp('paytm');
      expect(paytm.scheme, 'paytmmp');
      expect(paytm.host, 'pay');

      final any = forApp('any');
      expect(any.scheme, 'upi');
      expect(any.host, 'pay');

      final unknown = forApp('removed-app');
      expect(unknown.scheme, 'upi');
      expect(unknown.queryParameters['am'], '250.50');
    });
  });
}
