import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:url_launcher/url_launcher_string.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../core/upi.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

const _monoFallback = <String>[FinStackType.body];

const _fallbackCategories = [
  'Groceries',
  'Food',
  'Electricity',
  'Rent',
  'Transportation',
  'Shopping',
  'Medical',
  'Education',
  'Entertainment',
  'Bills',
  'Household',
  'Proxy',
  'Family',
  'Internal Transfer',
  'Other',
];

/// Confirm & pay, built around one action: the sticky pay bar is always on
/// screen, so the amount and the pay button never need a scroll.
class UpiPayPage extends StatefulWidget {
  final UpiPaymentRequest request;
  const UpiPayPage({super.key, required this.request});

  @override
  State<UpiPayPage> createState() => _UpiPayPageState();
}

class _UpiPayPageState extends State<UpiPayPage> with WidgetsBindingObserver {
  static const _upiChannel = MethodChannel('finstack/upi');
  static const _appKey = 'fintrack_upi_app';
  static const _storage = FlutterSecureStorage();
  static const _feedbackChannel = MethodChannel('finstack/payment_feedback');

  late final TextEditingController _amountCtrl;
  late final TextEditingController _vendorCtrl;
  final _productCtrl = TextEditingController();
  final _utrCtrl = TextEditingController();

  List<String> _categories = List.of(_fallbackCategories);
  String _selectedCategory = 'Other';
  Map? _vendor;
  bool _metaLoading = true;
  bool _detailsOpen = false;
  bool _showAllCategories = false;

  String? _preferredAppId;
  bool _appPrefLoaded = false;

  bool _opening = false;
  bool _saving = false;
  bool _saved = false;
  bool _savedMatched = false;
  bool _needsFamily = false;
  bool _awaitingPayment = false;
  bool _sawPause = false;
  String? _error;
  Map? _savedTxn;
  bool _savingDetails = false;
  bool _detailsSaved = false;
  String? _detailsError;

  String get _payeeName => _vendorCtrl.text.trim().isEmpty
      ? widget.request.payeeName
      : _vendorCtrl.text.trim();
  String get _savedCategory => '${_savedTxn?['category'] ?? 'Other'}';
  String get _savedProduct => '${_savedTxn?['productName'] ?? ''}';
  bool get _detailsChanged =>
      _selectedCategory != _savedCategory ||
      _productCtrl.text.trim() != _savedProduct;

  @override
  void initState() {
    super.initState();
    final preset = widget.request.amountPaise;
    _amountCtrl = TextEditingController(
      text: preset == null ? '' : _amountText(preset),
    );
    _vendorCtrl = TextEditingController(text: widget.request.payeeName);
    WidgetsBinding.instance.addObserver(this);
    _loadMeta();
    _loadAppPreference();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _amountCtrl.dispose();
    _vendorCtrl.dispose();
    _productCtrl.dispose();
    _utrCtrl.dispose();
    super.dispose();
  }

  static String _amountText(int paise) =>
      (paise / 100).toStringAsFixed(paise % 100 == 0 ? 0 : 2);

  int? _amountPaise() {
    final raw = _amountCtrl.text.replaceAll(',', '').trim();
    final parsed = double.tryParse(raw);
    if (parsed == null || !parsed.isFinite || parsed < 0.01) return null;
    return (parsed * 100).round();
  }

  Future<void> _loadAppPreference() async {
    String? saved;
    try {
      saved = await _storage.read(key: _appKey);
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _preferredAppId = upiAppById(saved)?.id;
      _appPrefLoaded = true;
    });
  }

  Future<void> _loadMeta() async {
    try {
      final res = await ApiClient.dio.get('/recipients/categories');
      final list = (res.data['categories'] as List?)
          ?.map((e) => '$e')
          .where((e) => e.trim().isNotEmpty)
          .toList();
      if (list != null && list.isNotEmpty && mounted) {
        setState(() => _categories = list);
      }
    } catch (_) {
      // The local list is a complete fallback.
    }

    try {
      final res = await ApiClient.dio.get(
        '/recipients/by-key',
        queryParameters: {
          'upiId': widget.request.payeeVpa,
          'label': widget.request.payeeName,
        },
      );
      final vendor = res.data['vendor'];
      if (vendor is Map && mounted && !_saving && !_saved) {
        final map = Map<String, dynamic>.from(vendor);
        setState(() {
          _vendor = map;
          if (map['label'] != null && '${map['label']}'.trim().isNotEmpty) {
            _vendorCtrl.text = '${map['label']}';
          }
          final primary = map['primaryCategory'] ?? map['category'];
          final offerings = map['offerings'];
          if (primary is String && primary.trim().isNotEmpty) {
            _selectedCategory = primary;
          } else if (offerings is List && offerings.isNotEmpty) {
            final first = offerings.first;
            if (first is Map && first['category'] is String) {
              _selectedCategory = first['category'];
            }
          }
          if (!_categories.contains(_selectedCategory)) {
            _categories = [..._categories, _selectedCategory];
          }
        });
      }
    } catch (_) {
      // New vendor: the transaction ingest creates it automatically.
    }

    if (mounted) setState(() => _metaLoading = false);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      if (_awaitingPayment) _sawPause = true;
      return;
    }
    if (state == AppLifecycleState.resumed &&
        _awaitingPayment &&
        _sawPause &&
        !_saving &&
        !_saved) {
      _awaitingPayment = false;
      _sawPause = false;
      Future<void>.delayed(const Duration(milliseconds: 350), () {
        if (mounted && !_saving && !_saved) _askPaymentResult();
      });
    }
  }

  Future<void> _openUpiApp() async {
    dismissKeyboard(context);
    final paise = _amountPaise();
    if (paise == null) {
      setState(() => _error = 'Enter the amount you need to pay.');
      return;
    }
    if (_opening) return;

    var appId = _preferredAppId;
    if (appId == null) {
      appId = await _chooseApp(firstTime: true);
      if (appId == null) return;
    }
    if (mounted) await _launchPayment(paise, appId);
  }

  Future<void> _launchPayment(int paise, String appId) async {
    if (_opening) return;
    setState(() {
      _opening = true;
      _error = null;
      _needsFamily = false;
    });

    String linkFor(String? id) =>
        buildScannedUpiLink(widget.request, amountPaise: paise, appId: id);

    _awaitingPayment = true;
    _sawPause = false;
    try {
      final app = upiAppById(appId)!;
      final bool opened;
      if (defaultTargetPlatform == TargetPlatform.android) {
        opened =
            await _upiChannel.invokeMethod<bool>('open', {
              'uri': linkFor(null),
              'package': app.androidPackage,
            }) ??
            false;
      } else {
        final fallback = switch (appId) {
          'gpay' => 'tez',
          'phonepe' => 'phonepeLegacy',
          _ => null,
        };
        opened =
            await launchUrlString(
              linkFor(appId),
              mode: LaunchMode.externalApplication,
            ) ||
            (fallback != null &&
                await launchUrlString(
                  linkFor(fallback),
                  mode: LaunchMode.externalApplication,
                ));
      }
      if (!mounted) return;
      if (!opened) {
        _awaitingPayment = false;
        _sawPause = false;
        setState(
          () => _error =
              '${_appLabel(appId)} could not open this payment link. Choose another app or scan the QR in your UPI app.',
        );
        return;
      }
    } catch (_) {
      _awaitingPayment = false;
      _sawPause = false;
      if (mounted) {
        setState(
          () => _error =
              'Could not open ${_appLabel(appId)}. Choose another app or scan the QR in your UPI app.',
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  String _appLabel(String? id) => upiAppById(id)?.label ?? 'Any UPI app';

  Future<bool> _isInstalled(UpiApp app) async {
    if (app.id == 'any') return true;
    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        return await _upiChannel.invokeMethod<bool>('supports', {
              'uri': 'upi://pay',
              'package': app.androidPackage,
            }) ??
            false;
      }
      return await canLaunchUrl(Uri.parse('${app.probeScheme}://')) ||
          (app.id == 'gpay' && await canLaunchUrl(Uri.parse('gpay://')));
    } catch (_) {
      return false;
    }
  }

  Future<String?> _chooseApp({bool firstTime = false}) async {
    dismissKeyboard(context);
    final installed = <String, bool>{};
    for (final app in upiApps) {
      installed[app.id] = await _isInstalled(app);
    }
    if (!mounted) return null;

    final ordered = [...upiApps]
      ..sort((a, b) {
        final ai = installed[a.id] == true ? 0 : 1;
        final bi = installed[b.id] == true ? 0 : 1;
        if (ai != bi) return ai.compareTo(bi);
        if (a.id == 'any') return 1;
        if (b.id == 'any') return -1;
        return 0;
      });

    final chosen = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: BrutalTag(
                  label: firstTime ? 'One-time setup' : 'Payment app',
                  color: FinStackColors.brandYellow,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                firstTime ? 'WHICH UPI APP DO YOU USE?' : 'OPEN WITH',
                style: const TextStyle(
                  fontFamily: FinStackType.display,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 5),
              const Text(
                'FinStack remembers this choice, so the next payment goes straight to it.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: FinStackColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 14),
              for (final app in ordered) ...[
                _AppRow(
                  label: app.label,
                  installed: installed[app.id] == true,
                  selected: app.id == (_preferredAppId ?? ''),
                  onTap: () => Navigator.of(sheetContext).pop(app.id),
                ),
                const SizedBox(height: 8),
              ],
            ],
          ),
        ),
      ),
    );
    if (chosen == null) return null;
    if (mounted) setState(() => _preferredAppId = chosen);
    try {
      await _storage.write(key: _appKey, value: chosen);
    } catch (_) {}
    return chosen;
  }

  Future<void> _askPaymentResult() async {
    if (!mounted) return;
    final paise = _amountPaise();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Align(
                alignment: Alignment.centerLeft,
                child: BrutalTag(
                  label: 'Final check',
                  color: FinStackColors.tertiary,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'DID THE PAYMENT GO THROUGH?',
                style: TextStyle(
                  fontFamily: FinStackType.display,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${inr((paise ?? widget.request.amountPaise ?? 0) / 100)} to $_payeeName',
                style: const TextStyle(
                  fontFamily: FinStackType.mono,
                  fontFamilyFallback: _monoFallback,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: FinStackColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              BrutalField(
                label: 'UPI reference / UTR (optional)',
                controller: _utrCtrl,
                hint: 'Shown in the payment app',
                textCapitalization: TextCapitalization.characters,
                enableSuggestions: false,
                autocorrect: false,
              ),
              const SizedBox(height: 8),
              const Text(
                'Check your UPI app’s transaction history. Save only if it shows success. If the payment is pending or your account was debited, check its status before paying again.',
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.45,
                  color: FinStackColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              BrutalButton(
                block: true,
                label: 'Yes, save this payment',
                icon: Icons.check,
                onPressed: () {
                  dismissKeyboard(sheetContext);
                  Navigator.of(sheetContext).pop(true);
                },
              ),
              const SizedBox(height: 8),
              BrutalButton(
                block: true,
                color: Colors.white,
                label: 'Payment failed or pending',
                onPressed: () => Navigator.of(sheetContext).pop(false),
              ),
            ],
          ),
        ),
      ),
    );
    if (saved == true) {
      await _saveTransaction();
    } else if (saved == false && mounted) {
      setState(() {
        _utrCtrl.clear();
        _error =
            'Check the payment status in your UPI app before trying again. If the app rejected the link, try its own QR scanner.';
      });
    }
  }

  Future<void> _confirmDirectSave() async {
    dismissKeyboard(context);
    final paise = _amountPaise();
    if (paise == null) {
      setState(() => _error = 'Enter the amount you need to pay.');
      return;
    }
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Align(
                alignment: Alignment.centerLeft,
                child: BrutalTag(
                  label: 'Already paid',
                  color: FinStackColors.brandYellow,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'SAVE WITHOUT OPENING A UPI APP?',
                style: TextStyle(
                  fontFamily: FinStackType.display,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Only use this if you paid in another app. It records the transaction in FinStack now.',
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.45,
                  color: FinStackColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              BrutalButton(
                block: true,
                label: 'Yes, save ${inr(paise / 100)}',
                onPressed: () => Navigator.of(sheetContext).pop(true),
              ),
              const SizedBox(height: 8),
              BrutalButton(
                block: true,
                color: Colors.white,
                label: 'Cancel',
                onPressed: () => Navigator.of(sheetContext).pop(false),
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed == true) {
      await _saveTransaction();
    }
  }

  Future<void> _saveTransaction() async {
    dismissKeyboard(context);
    final paise = _amountPaise();
    if (paise == null) {
      setState(() => _error = 'Enter the amount you need to pay.');
      return;
    }
    if (_saving || _saved) return;
    setState(() {
      _saving = true;
      _error = null;
      _needsFamily = false;
    });
    final product = _productCtrl.text.trim();
    final data = <String, dynamic>{
      'amountPaise': paise,
      'type': 'EXPENSE',
      'mode': 'UPI',
      'occurredAt': DateTime.now().toUtc().toIso8601String(),
      'category': _selectedCategory,
      'recipient': {'name': _payeeName, 'upiId': widget.request.payeeVpa},
      'upiId': widget.request.payeeVpa,
      'visibility': 'FAMILY',
      'origin': 'QR_SCAN',
      if (product.isNotEmpty) 'productName': product,
      if (widget.request.txnRef != null && widget.request.txnRef!.isNotEmpty)
        'metadata': {'qrRef': widget.request.txnRef},
      if (_utrCtrl.text.trim().isNotEmpty) 'utr': _utrCtrl.text.trim(),
    };
    try {
      final res = await ApiClient.dio.post('/transactions', data: data);
      if (!mounted) return;
      final body = res.data;
      final txn = body is Map ? (body['transaction'] ?? body) : body;
      final matched = body is Map && body['reconciled'] == true;
      setState(() {
        _saving = false;
        _saved = true;
        _savedMatched = matched;
        _savedTxn = txn is Map ? Map<String, dynamic>.from(txn) : null;
        if (_selectedCategory == 'Other') _selectedCategory = _savedCategory;
        _productCtrl.text = product.isEmpty ? _savedProduct : product;
      });
      unawaited(_playPaymentFeedback());
    } on DioException catch (e) {
      if (!mounted) return;
      final body = e.response?.data;
      var message = 'Could not save the transaction.';
      if (body is Map) {
        final error = body['error'];
        final details = body['details'];
        if (error != null) {
          message = details is List && details.isNotEmpty
              ? '$error: ${details.join(', ')}'
              : '$error';
        }
      }
      final family = message.toLowerCase().contains('family');
      setState(() {
        _saving = false;
        _needsFamily = family;
        _error = family
            ? 'Transactions need a family. Create or join one from Profile, then come back.'
            : e.response?.statusCode == 401
            ? 'Your session expired. Go back, log in again, then retry.'
            : message;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error =
              'Could not save the transaction. Check your connection and retry.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_saved) return _savedView(context);
    final paise = _amountPaise();
    final appLabel = _preferredAppId == null
        ? 'UPI app'
        : _appLabel(_preferredAppId);

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leadingWidth: 62,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: BrutalIconButton(
            icon: Icons.close,
            tooltip: 'Cancel',
            color: Colors.white,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        title: const Text('CONFIRM & PAY'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 14),
            child: Center(child: BrutalTag(label: 'UPI')),
          ),
        ],
      ),
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => dismissKeyboard(context),
        child: BrutalGrid(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
            children: [
              _payeeCard(paise),
              const SizedBox(height: 14),
              _amountCard(paise),
              const SizedBox(height: 14),
              _detailsCard(),
              if (_error != null) ...[const SizedBox(height: 14), _errorCard()],
            ],
          ),
        ),
      ),
      bottomNavigationBar: _actionBar(paise, appLabel),
    );
  }

  Widget _payeeCard(int? paise) {
    return BrutalCard(
      color: FinStackColors.brandYellow,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: FinStackColors.onSurface, width: 2),
                ),
                child: const Icon(Icons.qr_code_2, size: 19),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _payeeName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: FinStackType.display,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    height: 1.05,
                  ),
                ),
              ),
              BrutalTag(
                label: widget.request.hasAmount
                    ? 'Amount in QR'
                    : 'Enter amount',
                color: Colors.white,
              ),
            ],
          ),
          const SizedBox(height: 8),
          SelectableText(
            widget.request.payeeVpa,
            style: const TextStyle(
              fontFamily: FinStackType.mono,
              fontFamilyFallback: _monoFallback,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (widget.request.note != null) ...[
            const SizedBox(height: 4),
            Text(
              widget.request.note!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }

  Widget _amountCard(int? paise) {
    return BrutalCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'AMOUNT TO PAY',
                  style: TextStyle(
                    fontFamily: FinStackType.mono,
                    fontFamilyFallback: _monoFallback,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .7,
                  ),
                ),
              ),
              if (_metaLoading)
                const BrutalTag(
                  label: 'Loading payee',
                  color: FinStackColors.surfaceContainer,
                )
              else if (_vendor != null)
                const BrutalTag(
                  label: 'Saved payee',
                  color: FinStackColors.tertiary,
                )
              else
                const BrutalTag(
                  label: 'New payee',
                  color: FinStackColors.brandYellow,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Padding(
                padding: EdgeInsets.only(right: 8),
                child: Text(
                  '₹',
                  style: TextStyle(
                    fontFamily: FinStackType.mono,
                    fontFamilyFallback: _monoFallback,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    height: 1,
                  ),
                ),
              ),
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(
                      color: FinStackColors.onSurface,
                      width: 2.5,
                    ),
                  ),
                  child: TextField(
                    controller: _amountCtrl,
                    readOnly:
                        widget.request.isSigned && widget.request.hasAmount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => dismissKeyboard(context),
                    onChanged: (_) => setState(() => _error = null),
                    style: const TextStyle(
                      fontFamily: FinStackType.mono,
                      fontFamilyFallback: _monoFallback,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      height: 1.1,
                    ),
                    decoration: const InputDecoration(
                      hintText: '0',
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              BrutalIconButton(
                icon: Icons.keyboard_hide,
                tooltip: 'Done entering amount',
                color: FinStackColors.surfaceContainer,
                onPressed: () => dismissKeyboard(context),
              ),
            ],
          ),
          if (paise != null) ...[
            const SizedBox(height: 6),
            Text(
              inr(paise / 100),
              style: const TextStyle(
                fontFamily: FinStackType.mono,
                fontFamilyFallback: _monoFallback,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: FinStackColors.onSurfaceVariant,
              ),
            ),
          ],
          if (widget.request.isSigned) ...[
            const SizedBox(height: 8),
            Text(
              widget.request.hasAmount
                  ? 'The merchant set the amount on this QR.'
                  : 'Enter the same amount in your UPI app when it opens.',
              style: const TextStyle(
                fontSize: 11,
                height: 1.4,
                color: FinStackColors.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _detailsCard() {
    return BrutalCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _detailsOpen = !_detailsOpen),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'CATEGORY & NOTE',
                    style: TextStyle(
                      fontFamily: FinStackType.mono,
                      fontFamilyFallback: _monoFallback,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: .7,
                    ),
                  ),
                ),
                Text(
                  _selectedCategory.toUpperCase(),
                  style: const TextStyle(
                    fontFamily: FinStackType.mono,
                    fontFamilyFallback: _monoFallback,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  _detailsOpen
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  size: 18,
                ),
              ],
            ),
          ),
          if (_detailsOpen) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                for (final c in _visibleCategories())
                  _CategoryPill(
                    label: c,
                    selected: c == _selectedCategory,
                    onTap: () => setState(() => _selectedCategory = c),
                  ),
                if (_categories.length > 8)
                  _CategoryPill(
                    label: _showAllCategories ? 'Less' : 'More',
                    selected: false,
                    onTap: () => setState(
                      () => _showAllCategories = !_showAllCategories,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            BrutalField(
              label: 'Vendor / payee',
              controller: _vendorCtrl,
              hint: 'Merchant name',
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 10),
            BrutalField(
              label: 'What did you buy? (optional)',
              controller: _productCtrl,
              hint: 'e.g. Milk, groceries, dinner',
              textCapitalization: TextCapitalization.sentences,
            ),
          ],
        ],
      ),
    );
  }

  Widget _errorCard() {
    return Container(
      padding: const EdgeInsets.all(12),
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
              _error!,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                height: 1.4,
                color: FinStackColors.onErrorContainer,
              ),
            ),
          ),
          if (_needsFamily) ...[
            const SizedBox(height: 8),
            BrutalButton(
              label: 'Open Profile',
              onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
            ),
          ],
        ],
      ),
    );
  }

  Widget _actionBar(int? paise, String appLabel) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: FinStackColors.onSurface, width: 2.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'YOU PAY',
                        style: TextStyle(
                          fontFamily: FinStackType.mono,
                          fontFamilyFallback: _monoFallback,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .8,
                          color: FinStackColors.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        inr((paise ?? 0) / 100),
                        style: const TextStyle(
                          fontFamily: FinStackType.mono,
                          fontFamilyFallback: _monoFallback,
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                          height: 1.1,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Semantics(
                    button: true,
                    label: 'Choose payment app',
                    child: GestureDetector(
                      onTap: _appPrefLoaded ? () => _chooseApp() : null,
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 40),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: FinStackColors.surfaceContainer,
                          border: Border.all(
                            color: FinStackColors.onSurface,
                            width: 2,
                          ),
                          boxShadow: const [
                            BoxShadow(
                              color: FinStackColors.onSurface,
                              offset: Offset(2, 2),
                              blurRadius: 0,
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _preferredAppId == null ? 'Choose app' : appLabel,
                              style: const TextStyle(
                                fontFamily: FinStackType.display,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(Icons.swap_horiz, size: 14),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (_preferredAppId == 'bhim' &&
                  defaultTargetPlatform == TargetPlatform.iOS &&
                  !widget.request.isMerchant)
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'BHIM on iPhone can reject links to personal UPI IDs.',
                    style: TextStyle(fontSize: 11),
                  ),
                ),
              BrutalButton(
                block: true,
                label: _opening
                    ? 'Opening $appLabel…'
                    : _saving
                    ? 'Saving payment…'
                    : paise == null
                    ? 'Enter an amount'
                    : 'Pay ${inr(paise / 100)} with UPI app',
                icon: Icons.open_in_new,
                fontSize: 13,
                onPressed: _opening || _saving ? null : _openUpiApp,
              ),
              const SizedBox(height: 2),
              TextButton(
                onPressed: _saving ? null : _confirmDirectSave,
                child: const Text(
                  'ALREADY PAID? SAVE IT',
                  style: TextStyle(
                    fontFamily: FinStackType.mono,
                    fontFamilyFallback: _monoFallback,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .4,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<String> _visibleCategories() {
    final base = _showAllCategories
        ? List<String>.from(_categories)
        : _categories.take(8).toList();
    if (!base.contains(_selectedCategory)) base.add(_selectedCategory);
    return base;
  }

  Future<void> _playPaymentFeedback() async {
    unawaited(HapticFeedback.lightImpact());
    try {
      await _feedbackChannel.invokeMethod<void>('playSuccess');
    } on MissingPluginException {
      // The payment result is also used in Flutter tests and desktop previews.
    } on PlatformException {
      // Audio availability does not affect the saved payment.
    }
  }

  Future<void> _savePurchaseDetails() async {
    final id = _savedTxn?['_id'] ?? _savedTxn?['id'];
    if (id == null || _savingDetails || !_detailsChanged) return;
    dismissKeyboard(context);
    final product = _productCtrl.text.trim();
    setState(() {
      _savingDetails = true;
      _detailsSaved = false;
      _detailsError = null;
    });

    try {
      final res = await ApiClient.dio.patch(
        '/transactions/$id',
        data: {
          'category': _selectedCategory,
          if (product != _savedProduct) 'productName': product,
        },
      );
      final transaction = Map<String, dynamic>.from(
        res.data['transaction'] as Map,
      );
      if (!mounted) return;
      setState(() {
        _savedTxn = transaction;
        _selectedCategory = _savedCategory;
        _productCtrl.text = _savedProduct;
        _detailsSaved = true;
      });
    } on DioException catch (error) {
      if (!mounted) return;
      setState(() {
        _detailsError = switch (error.response?.statusCode) {
          401 => 'Your session expired. Sign in again to edit this payment.',
          403 => 'You don’t have permission to edit this payment.',
          404 => 'This transaction is no longer available.',
          _ => 'Could not save purchase details. Try again.',
        };
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _detailsError = 'Could not save purchase details. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _savingDetails = false);
    }
  }

  void _editPurchaseDetails(VoidCallback edit) {
    setState(() {
      edit();
      _detailsSaved = false;
      _detailsError = null;
    });
  }

  Widget _savedView(BuildContext context) {
    final paise = _amountPaise() ?? widget.request.amountPaise ?? 0;
    final status = '${_savedTxn?['status'] ?? ''}';
    final needsReview = status == 'PENDING_REVIEW';
    final matched = _savedMatched || status == 'RECONCILED';
    final canEdit = _savedTxn?['_id'] != null || _savedTxn?['id'] != null;
    return PopScope(
      canPop: !_savingDetails,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('PAYMENT SAVED'),
          automaticallyImplyLeading: false,
          actions: const [
            Padding(
              padding: EdgeInsets.only(right: 14),
              child: Center(
                child: BrutalTag(
                  label: 'Recorded',
                  color: FinStackColors.tertiary,
                ),
              ),
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: BrutalGrid(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
              children: [
                BrutalCard(
                  color: FinStackColors.surfaceContainer,
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const _PaymentCheck(),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Semantics(
                              header: true,
                              liveRegion: true,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Payment recorded',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: FinStackColors.onSurfaceVariant,
                                    ),
                                  ),
                                  Text(
                                    inr(paise / 100),
                                    style: const TextStyle(
                                      fontFamily: FinStackType.mono,
                                      fontFamilyFallback: _monoFallback,
                                      fontSize: 28,
                                      fontWeight: FontWeight.w800,
                                      height: 1.1,
                                      letterSpacing: -.6,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _payeeName,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.request.payeeVpa,
                        style: const TextStyle(
                          fontFamily: FinStackType.mono,
                          fontFamilyFallback: _monoFallback,
                          fontSize: 12,
                          color: FinStackColors.onSurfaceVariant,
                        ),
                      ),
                      if (_utrCtrl.text.trim().isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          'UPI reference: ${_utrCtrl.text.trim()}',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                      if (needsReview || matched) ...[
                        const SizedBox(height: 12),
                        Text(
                          needsReview
                              ? 'A similar entry exists. This payment is saved for review.'
                              : 'Linked to an existing bank transaction.',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (canEdit) ...[
                  const SizedBox(height: 14),
                  _purchaseDetailsCard(),
                ],
                const SizedBox(height: 20),
                BrutalButton(
                  block: true,
                  label: 'Done',
                  icon: Icons.check,
                  fontSize: 13,
                  padding: const EdgeInsets.all(15),
                  onPressed: _savingDetails
                      ? null
                      : () => Navigator.of(context).popUntil((r) => r.isFirst),
                ),
                const SizedBox(height: 10),
                BrutalButton(
                  block: true,
                  color: Colors.white,
                  label: 'Scan another QR',
                  icon: Icons.qr_code_scanner,
                  fontSize: 13,
                  padding: const EdgeInsets.all(15),
                  onPressed: _savingDetails
                      ? null
                      : () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _purchaseDetailsCard() => BrutalCard(
    padding: const EdgeInsets.all(14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: const Text(
            'Purchase details',
            style: TextStyle(
              fontFamily: FinStackType.display,
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(height: 3),
        const Text(
          'Optional. Add details to help FinStack categorize future payments.',
          style: TextStyle(
            fontSize: 12,
            height: 1.4,
            color: FinStackColors.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          key: ValueKey(_savedCategory),
          isExpanded: true,
          initialValue: _selectedCategory,
          decoration: const InputDecoration(
            labelText: 'Category',
            labelStyle: TextStyle(
              fontFamily: FinStackType.mono,
              fontFamilyFallback: _monoFallback,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: .6,
            ),
          ),
          items: [
            for (final category in {..._categories, _selectedCategory})
              DropdownMenuItem(value: category, child: Text(category)),
          ],
          onChanged: _savingDetails
              ? null
              : (value) {
                  if (value != null) {
                    _editPurchaseDetails(() => _selectedCategory = value);
                  }
                },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _productCtrl,
          enabled: !_savingDetails,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: 'What did you buy?',
            hintText: 'e.g. Coffee, groceries, bus ticket',
            labelStyle: TextStyle(
              fontFamily: FinStackType.mono,
              fontFamilyFallback: _monoFallback,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: .6,
            ),
          ),
          onChanged: (_) => _editPurchaseDetails(() {}),
          onSubmitted: (_) => _savePurchaseDetails(),
        ),
        const SizedBox(height: 14),
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(double.infinity, 48),
            backgroundColor: FinStackColors.surfaceContainer,
            textStyle: const TextStyle(
              fontFamily: FinStackType.display,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: .4,
            ),
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.zero,
            ),
            side: const BorderSide(color: FinStackColors.onSurface, width: 2),
          ),
          onPressed: _detailsChanged && !_savingDetails
              ? _savePurchaseDetails
              : null,
          child: Text(_savingDetails ? 'Saving details…' : 'Save details'),
        ),
        if (_detailsSaved || _detailsError != null) ...[
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text(
              _detailsError ?? 'Purchase details saved.',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12,
                height: 1.4,
                color: _detailsError != null
                    ? FinStackColors.onErrorContainer
                    : FinStackColors.successInk,
              ),
            ),
          ),
        ],
      ],
    ),
  );
}

class _AppRow extends StatelessWidget {
  final String label;
  final bool installed;
  final bool selected;
  final VoidCallback onTap;
  const _AppRow({
    required this.label,
    required this.installed,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? FinStackColors.brandYellow : Colors.white,
            border: Border.all(color: FinStackColors.onSurface, width: 2.5),
            boxShadow: const [
              BoxShadow(
                color: FinStackColors.onSurface,
                offset: Offset(2.5, 2.5),
                blurRadius: 0,
              ),
            ],
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontFamily: FinStackType.display,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (selected)
                const BrutalTag(label: 'Preferred', color: Colors.white)
              else if (installed)
                const BrutalTag(
                  label: 'Installed',
                  color: FinStackColors.tertiary,
                )
              else
                const BrutalTag(
                  label: 'Not detected',
                  color: FinStackColors.surfaceContainer,
                ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentCheck extends StatelessWidget {
  const _PaymentCheck();

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return ExcludeSemantics(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: reduceMotion ? 1.0 : 0.0, end: 1.0),
        duration: reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 580),
        builder: (context, progress, _) {
          final arrival = Curves.easeOutCubic.transform(
            (progress / .46).clamp(0.0, 1.0),
          );
          final stroke = Curves.easeOutCubic.transform(
            ((progress - .18) / .82).clamp(0.0, 1.0),
          );
          return Transform.scale(
            scale: .78 + .22 * arrival,
            child: Container(
              width: 52,
              height: 52,
              decoration: brutal(
                color: FinStackColors.accentBlue,
                border: 2.5,
                shadow: 3,
              ),
              child: CustomPaint(painter: _CheckStroke(stroke)),
            ),
          );
        },
      ),
    );
  }
}

class _CheckStroke extends CustomPainter {
  const _CheckStroke(this.progress);
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final check = Path()
      ..moveTo(size.width * .23, size.height * .52)
      ..lineTo(size.width * .43, size.height * .70)
      ..lineTo(size.width * .77, size.height * .32);
    final metric = check.computeMetrics().first;
    canvas.drawPath(
      metric.extractPath(0, progress * metric.length),
      Paint()
        ..color = FinStackColors.onSurface
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_CheckStroke oldDelegate) =>
      progress != oldDelegate.progress;
}

class _CategoryPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? FinStackColors.brandYellow : Colors.white,
          border: Border.all(color: FinStackColors.onSurface, width: 2),
          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: FinStackColors.onSurface,
                    offset: Offset(2, 2),
                    blurRadius: 0,
                  ),
                ]
              : const [],
        ),
        child: Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontFamily: FinStackType.mono,
            fontFamilyFallback: _monoFallback,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            letterSpacing: .4,
          ),
        ),
      ),
    );
  }
}
