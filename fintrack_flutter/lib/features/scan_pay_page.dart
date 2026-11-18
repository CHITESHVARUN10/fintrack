import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../core/upi.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import 'upi_pay_page.dart';

class ScanPayPage extends StatefulWidget {
  const ScanPayPage({super.key});

  @override
  State<ScanPayPage> createState() => _ScanPayPageState();
}

class _ScanPayPageState extends State<ScanPayPage>
    with SingleTickerProviderStateMixin {
  late final MobileScannerController _scanner;
  late final AnimationController _scanLine;
  final _manualCtrl = TextEditingController();

  bool _handled = false;
  bool _openingReview = false;
  bool _torchOn = false;
  String? _scanError;
  MobileScannerException? _cameraException;

  @override
  void initState() {
    super.initState();
    _scanner = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      formats: const [BarcodeFormat.qrCode],
    );
    _scanLine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat();
  }

  @override
  void dispose() {
    _scanLine.dispose();
    _scanner.dispose();
    _manualCtrl.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled || _openingReview) return;
    String? raw;
    for (final barcode in capture.barcodes) {
      if (barcode.rawValue != null && barcode.rawValue!.trim().isNotEmpty) {
        raw = barcode.rawValue;
        break;
      }
    }
    if (raw == null) return;

    HapticFeedback.mediumImpact();
    final parsed = parseUpiQr(raw);
    if (parsed == null) {
      setState(() {
        _handled = true;
        _scanError = 'That QR is not a UPI payment code. Try a payment QR, or enter the UPI ID manually.';
      });
      await _stopCamera();
      return;
    }
    setState(() {
      _handled = true;
      _scanError = null;
    });
    await _openReview(parsed);
  }

  Future<void> _stopCamera() async {
    try {
      await _scanner.stop();
    } catch (_) {}
  }

  Future<void> _openReview(UpiPaymentRequest request) async {
    if (_openingReview) return;
    setState(() => _openingReview = true);
    await _stopCamera();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => UpiPayPage(request: request)),
    );
    if (!mounted) return;
    setState(() {
      _openingReview = false;
      _handled = false;
      _scanError = null;
    });
    try {
      await _scanner.start();
    } catch (_) {}
  }

  Future<void> _resumeScan() async {
    setState(() {
      _handled = false;
      _scanError = null;
    });
    try {
      await _scanner.start();
    } catch (_) {}
  }

  Future<void> _toggleTorch() async {
    try {
      await _scanner.toggleTorch();
      if (mounted) setState(() => _torchOn = !_torchOn);
    } catch (_) {
      _snack('This camera does not expose a torch.');
    }
  }

  Future<void> _switchCamera() async {
    try {
      await _scanner.switchCamera();
    } catch (_) {
      _snack('Could not switch camera.');
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _enterManually() async {
    _manualCtrl.clear();
    String? error;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          void submit() {
            final parsed = parseUpiQr(_manualCtrl.text);
            if (parsed == null) {
              setSheetState(() =>
                  error = 'Enter a valid UPI ID, for example merchant@okhdfcbank.');
              return;
            }
            Navigator.of(sheetContext).pop();
            _openReview(parsed);
          }

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: BrutalTag(label: 'No camera? No problem'),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'ENTER A UPI ID',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Use the merchant UPI ID when the QR is damaged or the camera is unavailable.',
                    style: TextStyle(color: FinStackColors.onSurfaceVariant, fontSize: 12),
                  ),
                  const SizedBox(height: 14),
                  BrutalField(
                    label: 'UPI ID',
                    controller: _manualCtrl,
                    hint: 'merchant@okhdfcbank',
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    onChanged: (_) => setSheetState(() => error = null),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      error!,
                      style: const TextStyle(
                        color: FinStackColors.onErrorContainer,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  BrutalButton(
                    block: true,
                    label: 'Continue',
                    icon: Icons.arrow_forward,
                    onPressed: submit,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_cameraException != null) {
      return _cameraErrorPage(_cameraException!);
    }
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        resizeToAvoidBottomInset: false,
        body: Stack(
          fit: StackFit.expand,
          children: [
            MobileScanner(
              controller: _scanner,
              onDetect: _onDetect,
              errorBuilder: (context, error) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted && _cameraException != error) {
                    setState(() => _cameraException = error);
                  }
                });
                return const SizedBox.shrink();
              },
            ),
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: _scanLine,
                  builder: (context, _) => CustomPaint(
                    painter: _ScanOverlayPainter(progress: _scanLine.value),
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(children: [
                      BrutalIconButton(
                        icon: Icons.close,
                        tooltip: 'Close',
                        color: Colors.white,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.72),
                          border: Border.all(color: FinStackColors.brandYellow, width: 2),
                        ),
                        child: const Row(children: [
                          Text(
                            'SCAN & PAY',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.8,
                            ),
                          ),
                          SizedBox(width: 8),
                          BrutalTag(label: 'UPI'),
                        ]),
                      ),
                      const Spacer(),
                      BrutalIconButton(
                        icon: _torchOn ? Icons.flash_on : Icons.flash_off,
                        tooltip: 'Torch',
                        color: _torchOn ? FinStackColors.brandYellow : Colors.white,
                        onPressed: _toggleTorch,
                      ),
                      const SizedBox(width: 8),
                      BrutalIconButton(
                        icon: Icons.cameraswitch,
                        tooltip: 'Switch camera',
                        color: Colors.white,
                        onPressed: _switchCamera,
                      ),
                    ]),
                    const Spacer(),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Text(
                        'ALIGN THE QR INSIDE THE FRAME',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.88),
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                          shadows: const [
                            Shadow(color: Colors.black, blurRadius: 6),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    BrutalCard(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Row(children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: FinStackColors.brandYellow,
                              border: Border.all(color: FinStackColors.onSurface, width: 2),
                            ),
                            child: const Icon(Icons.qr_code_scanner, size: 22),
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(
                                'POINT AT A UPI QR',
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
                              ),
                              Text(
                                'Payee, UPI ID and amount are read automatically.',
                                style: TextStyle(fontSize: 10),
                              ),
                            ]),
                          ),
                        ]),
                        if (_scanError != null) ...[
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: FinStackColors.errorContainer,
                              border: Border.all(color: FinStackColors.onSurface, width: 2),
                            ),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(
                                _scanError!,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: FinStackColors.onErrorContainer,
                                ),
                              ),
                              const SizedBox(height: 8),
                              BrutalButton(
                                label: 'Scan again',
                                icon: Icons.refresh,
                                onPressed: _resumeScan,
                              ),
                            ]),
                          ),
                        ],
                        if (_openingReview) ...[
                          const SizedBox(height: 10),
                          const LinearProgressIndicator(minHeight: 4),
                        ],
                        const SizedBox(height: 10),
                        BrutalButton(
                          block: true,
                          color: FinStackColors.surfaceContainer,
                          label: 'Enter UPI ID instead',
                          icon: Icons.keyboard,
                          onPressed: _openingReview ? null : _enterManually,
                        ),
                      ]),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cameraErrorPage(MobileScannerException error) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    final unsupported = error.errorCode == MobileScannerErrorCode.unsupported;
    final title = denied
        ? 'CAMERA ACCESS IS OFF'
        : unsupported
            ? 'CAMERA NOT AVAILABLE'
            : 'CAMERA COULD NOT START';
    final message = denied
        ? 'Enable camera access for FinStack in Settings, then retry — or enter the UPI ID manually.'
        : unsupported
            ? 'This device cannot run the camera scanner. Enter the UPI ID manually instead.'
            : 'Something stopped the camera. Retry, or enter the UPI ID manually.';
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        appBar: AppBar(title: const Text('SCAN & PAY')),
        body: BrutalGrid(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            BrutalCard(
              color: denied ? FinStackColors.errorContainer : Colors.white,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: FinStackColors.brandYellow,
                      border: Border.all(color: FinStackColors.onSurface, width: 2),
                    ),
                    child: const Icon(Icons.no_photography_outlined, size: 24),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                Text(message, style: const TextStyle(fontSize: 12, height: 1.4)),
                const SizedBox(height: 14),
                BrutalButton(
                  block: true,
                  label: 'Retry camera',
                  icon: Icons.refresh,
                  onPressed: () async {
                    setState(() => _cameraException = null);
                    try {
                      await _scanner.start();
                    } catch (_) {
                      _snack('Camera still unavailable. Use manual entry.');
                    }
                  },
                ),
                const SizedBox(height: 8),
                BrutalButton(
                  block: true,
                  color: Colors.white,
                  label: 'Enter UPI ID manually',
                  icon: Icons.keyboard,
                  onPressed: _enterManually,
                ),
              ]),
            ),
            const SizedBox(height: 12),
            const BrutalCard(
              color: FinStackColors.surfaceContainer,
              child: Text(
                'Why scan? The payee name, UPI ID and amount are read from the code, then you confirm the payment in your UPI app. FinStack only records the transaction after you confirm it succeeded.',
                style: TextStyle(fontSize: 11, height: 1.4),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _ScanOverlayPainter extends CustomPainter {
  final double progress;
  const _ScanOverlayPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final side = math.min(size.width * 0.72, 300.0);
    final rect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.42),
      width: side,
      height: side,
    );

    final shade = Path.combine(
      PathOperation.difference,
      Path()..addRect(Offset.zero & size),
      Path()..addRect(rect),
    );
    canvas.drawPath(shade, Paint()..color = Colors.black.withValues(alpha: 0.52));

    final black = Paint()
      ..color = Colors.black
      ..strokeWidth = 7
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;
    final yellow = Paint()
      ..color = FinStackColors.brandYellow
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.square;

    const arm = 28.0;
    void corners(Paint paint) {
      // top-left
      canvas.drawPath(
        Path()
          ..moveTo(rect.left, rect.top + arm)
          ..lineTo(rect.left, rect.top)
          ..lineTo(rect.left + arm, rect.top),
        paint,
      );
      // top-right
      canvas.drawPath(
        Path()
          ..moveTo(rect.right - arm, rect.top)
          ..lineTo(rect.right, rect.top)
          ..lineTo(rect.right, rect.top + arm),
        paint,
      );
      // bottom-left
      canvas.drawPath(
        Path()
          ..moveTo(rect.left, rect.bottom - arm)
          ..lineTo(rect.left, rect.bottom)
          ..lineTo(rect.left + arm, rect.bottom),
        paint,
      );
      // bottom-right
      canvas.drawPath(
        Path()
          ..moveTo(rect.right - arm, rect.bottom)
          ..lineTo(rect.right, rect.bottom)
          ..lineTo(rect.right, rect.bottom - arm),
        paint,
      );
    }

    corners(black);
    corners(yellow);

    final lineY = rect.top + 8 + (rect.height - 16) * progress;
    final lineRect = Rect.fromLTWH(rect.left + 10, lineY, rect.width - 20, 3);
    canvas.drawRect(
      lineRect.inflate(2),
      Paint()..color = FinStackColors.brandYellow.withValues(alpha: 0.18),
    );
    canvas.drawRect(lineRect, Paint()..color = FinStackColors.brandYellow);

    // Small corner ticks for a scan-registration feel.
    final tick = Paint()
      ..color = Colors.white.withValues(alpha: 0.55)
      ..strokeWidth = 1.5;
    for (var i = 1; i < 5; i++) {
      final x = rect.left + (rect.width / 5) * i;
      canvas.drawLine(Offset(x, rect.top - 7), Offset(x, rect.top - 3), tick);
      canvas.drawLine(Offset(x, rect.bottom + 3), Offset(x, rect.bottom + 7), tick);
    }
  }

  @override
  bool shouldRepaint(covariant _ScanOverlayPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
