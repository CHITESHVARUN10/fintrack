import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/upi.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import 'upi_pay_page.dart';

const _monoFallback = <String>[FinStackType.body];

const _cameraBg = Color(0xFF252624);
const _cameraPillBg = Color(0xFF181816);
const _cameraText = Color(0xFFEAE5D6);

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
      duration: const Duration(milliseconds: 1050),
    )..repeat(reverse: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _scanLine
        ..stop()
        ..value = .5;
    } else if (!_scanLine.isAnimating) {
      _scanLine.repeat(reverse: true);
    }
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
        _scanError =
            'That QR is not a UPI payment code. Try a payment QR, or enter the UPI ID manually.';
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
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => UpiPayPage(request: request)));
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
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _enterManually() async {
    _manualCtrl.clear();
    String? error;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          void submit() {
            final parsed = parseUpiQr(_manualCtrl.text);
            if (parsed == null) {
              setSheetState(
                () => error =
                    'Enter a valid UPI ID, for example merchant@okhdfcbank.',
              );
              return;
            }
            Navigator.of(sheetContext).pop();
            _openReview(parsed);
          }

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: BrutalTag(
                      label: 'No camera? No problem',
                      color: FinStackColors.brandYellow,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'ENTER A UPI ID',
                    style: TextStyle(
                      fontFamily: FinStackType.display,
                      fontSize: 21,
                      fontWeight: FontWeight.w700,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Use the merchant UPI ID when the QR is damaged or the camera is unavailable.',
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.4,
                      color: FinStackColors.onSurfaceVariant,
                    ),
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
                      style: TextStyle(
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
        backgroundColor: _cameraBg,
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
                child: ColoredBox(color: Colors.black.withValues(alpha: .18)),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _topBar(),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final side = math.min(
                            248.0,
                            math.max(150.0, constraints.maxHeight - 52),
                          );
                          return Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Semantics(
                                  label:
                                      'Camera preview. Point the camera at a UPI QR code.',
                                  child: SizedBox(
                                    width: side,
                                    height: side,
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        ColoredBox(
                                          color: Colors.white.withValues(
                                            alpha: .14,
                                          ),
                                        ),
                                        AnimatedBuilder(
                                          animation: _scanLine,
                                          builder: (context, _) => CustomPaint(
                                            painter: _ViewfinderPainter(
                                              progress: _scanLine.value,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                const Text(
                                  'ALIGN THE QR INSIDE THE FRAME',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontFamily: FinStackType.mono,
                                    fontFamilyFallback: _monoFallback,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: .8,
                                    color: _cameraText,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                    _bottomCard(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    return SizedBox(
      height: 44,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: BrutalIconButton(
              icon: Icons.close,
              tooltip: 'Close',
              color: Colors.white,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: _cameraPillBg,
              border: Border.all(color: FinStackColors.brandYellow, width: 2.5),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'SCAN & PAY',
                  style: TextStyle(
                    fontFamily: FinStackType.display,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .4,
                    color: Colors.white,
                  ),
                ),
                SizedBox(width: 8),
                BrutalTag(label: 'UPI'),
              ],
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
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
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bottomCard() {
    return BrutalCard(
      padding: const EdgeInsets.all(14),
      shadow: 5,
      shadowColor: Colors.black,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: FinStackColors.brandYellow,
                  border: Border.all(
                    color: FinStackColors.onSurface,
                    width: 2.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: FinStackColors.shadow,
                      offset: Offset(2.5, 2.5),
                      blurRadius: 0,
                    ),
                  ],
                ),
                child: const Icon(Icons.qr_code_2, size: 22),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'POINT AT A UPI QR',
                      style: TextStyle(
                        fontFamily: FinStackType.display,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Payee, UPI ID and amount are read automatically.',
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.35,
                        color: FinStackColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_scanError != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: FinStackColors.errorContainer,
                border: Border.all(color: FinStackColors.onSurface, width: 2),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      _scanError!,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        fontWeight: FontWeight.w700,
                        color: FinStackColors.onErrorContainer,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  BrutalButton(
                    label: 'Scan again',
                    icon: Icons.refresh,
                    fontSize: 11,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 11,
                      vertical: 8,
                    ),
                    onPressed: _resumeScan,
                  ),
                ],
              ),
            ),
          ],
          if (_openingReview) ...[
            const SizedBox(height: 10),
            const LinearProgressIndicator(
              minHeight: 4,
              semanticsLabel: 'Opening payment review',
            ),
          ],
          const SizedBox(height: 12),
          BrutalButton(
            block: true,
            color: FinStackColors.surfaceContainer,
            label: 'Enter UPI ID instead',
            icon: Icons.keyboard,
            onPressed: _openingReview ? null : _enterManually,
          ),
        ],
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
    final tag = denied
        ? 'No access'
        : unsupported
        ? 'Unavailable'
        : 'Camera error';
    final message = denied
        ? 'Enable camera access for FinStack in Settings, then retry — or enter the UPI ID manually.'
        : unsupported
        ? 'This device cannot run the camera scanner. Enter the UPI ID manually instead.'
        : 'Something stopped the camera. Retry, or enter the UPI ID manually.';
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('SCAN & PAY'),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: Center(
                child: BrutalTag(
                  label: tag,
                  color: FinStackColors.errorContainer,
                  textColor: FinStackColors.onErrorContainer,
                ),
              ),
            ),
          ],
        ),
        body: BrutalGrid(
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: [
              BrutalCard(
                color: FinStackColors.errorContainer,
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: FinStackColors.brandYellow,
                            border: Border.all(
                              color: FinStackColors.onSurface,
                              width: 2.5,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: FinStackColors.shadow,
                                offset: Offset(2.5, 2.5),
                                blurRadius: 0,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.no_photography_outlined,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              fontFamily: FinStackType.display,
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              height: 1.15,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      message,
                      style: const TextStyle(
                        fontSize: 12.5,
                        height: 1.45,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
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
                  ],
                ),
              ),
              const SizedBox(height: 14),
              BrutalCard(
                color: FinStackColors.surfaceContainer,
                padding: EdgeInsets.all(14),
                child: Text(
                  'Why scan? The payee name, UPI ID and amount are read from the code, then you confirm the payment in your UPI app. FinStack only records the transaction after you confirm it succeeded.',
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ViewfinderPainter extends CustomPainter {
  const _ViewfinderPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    const arm = 28.0;
    final bracket = Paint()
      ..color = FinStackColors.brandYellow
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.butt;

    void corners(Rect rect) {
      final left = rect.left;
      final top = rect.top;
      final right = rect.right;
      final bottom = rect.bottom;
      canvas.drawPath(
        Path()
          ..moveTo(left, top + arm)
          ..lineTo(left, top)
          ..lineTo(left + arm, top),
        bracket,
      );
      canvas.drawPath(
        Path()
          ..moveTo(right - arm, top)
          ..lineTo(right, top)
          ..lineTo(right, top + arm),
        bracket,
      );
      canvas.drawPath(
        Path()
          ..moveTo(left, bottom - arm)
          ..lineTo(left, bottom)
          ..lineTo(left + arm, bottom),
        bracket,
      );
      canvas.drawPath(
        Path()
          ..moveTo(right - arm, bottom)
          ..lineTo(right, bottom)
          ..lineTo(right, bottom - arm),
        bracket,
      );
    }

    corners(Offset.zero & size);

    final y = 18 + (size.height - 39) * progress;
    final laser = Rect.fromLTWH(10, y, size.width - 20, 3.5);
    canvas.drawRect(
      laser.inflate(2),
      Paint()
        ..color = FinStackColors.brandYellow.withValues(alpha: .5)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawRect(laser, Paint()..color = FinStackColors.brandYellow);
  }

  @override
  bool shouldRepaint(covariant _ViewfinderPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
