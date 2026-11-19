import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../core/upi.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

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
  static const _appKey = 'fintrack_upi_app';
  static const _storage = FlutterSecureStorage();

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
    if (parsed == null || parsed <= 0) return null;
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
      if (vendor is Map && mounted) {
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
    // BHIM 4.0.30 on iOS only opens merchant VPAs; everything else dies with
    // "This request type is not supported". Warn before wasting the trip.
    if (appId == 'bhim') {
      final action = await _bhimWarning();
      if (action == 'switch') {
        final next = await _chooseApp();
        if (next == null || next == 'bhim') return;
        appId = next;
      } else if (action != 'open') {
        return;
      }
    }
    await _launchPayment(paise, appId);
  }

  Future<String?> _bhimWarning() {
    return showModalBottomSheet<String>(
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
                  label: 'BHIM limitation',
                  color: FinStackColors.errorContainer,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'BHIM MAY REJECT THIS PAYMENT',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'BHIM 4.0.30 on iPhone only accepts merchant UPI IDs. This QR looks like a personal UPI ID, so BHIM will probably show “This request type is not supported”.',
                style: TextStyle(color: FinStackColors.onSurfaceVariant),
              ),
              const SizedBox(height: 16),
              BrutalButton(
                block: true,
                label: 'Use another app',
                icon: Icons.swap_horiz,
                onPressed: () => Navigator.of(sheetContext).pop('switch'),
              ),
              const SizedBox(height: 8),
              BrutalButton(
                block: true,
                color: Colors.white,
                label: 'Open BHIM anyway',
                onPressed: () => Navigator.of(sheetContext).pop('open'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _launchPayment(int paise, String appId) async {
    if (_opening) return;
    setState(() {
      _opening = true;
      _error = null;
      _needsFamily = false;
    });

    final note = widget.request.note ?? _productCtrl.text.trim();
    final payee = _vendorCtrl.text.trim().isEmpty
        ? widget.request.payeeName
        : _vendorCtrl.text.trim();

    Uri uriFor(String? id) => buildUpiUri(
      payeeVpa: widget.request.payeeVpa,
      payeeName: payee,
      amountPaise: paise,
      note: note.isEmpty ? null : note,
      merchantCode: widget.request.merchantCode,
      txnRef: widget.request.txnRef,
      appId: id,
    );

    _awaitingPayment = true;
    _sawPause = false;
    try {
      var opened = await launchUrl(
        uriFor(appId),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && appId != 'any') {
        // Bank apps vary: fall back to the untargeted UPI intent.
        opened = await launchUrl(
          uriFor(null),
          mode: LaunchMode.externalApplication,
        );
      }
      if (!mounted) return;
      if (!opened) {
        _awaitingPayment = false;
        _sawPause = false;
        setState(
          () => _error =
              'That app did not accept the payment. Pick another UPI app, or save the payment below.',
        );
        return;
      }
    } catch (_) {
      _awaitingPayment = false;
      _sawPause = false;
      if (mounted) {
        setState(
          () => _error =
              'Could not open ${_appLabel(appId)}. Pick another app, or save the payment below.',
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  String _appLabel(String? id) => upiAppById(id)?.label ?? 'Any UPI app';

  Future<bool> _isInstalled(UpiApp app) async {
    // The generic intent is always available to the OS, even when none of the
    // probed schemes resolve.
    if (app.id == 'any') return true;
    try {
      return await canLaunchUrl(Uri.parse('${app.probeScheme}://'));
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
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 20),
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
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'FinStack remembers this choice, so the next payment goes straight to it.',
                style: TextStyle(
                  fontSize: 11,
                  color: FinStackColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 14),
              for (final app in ordered) ...[
                _AppRow(
                  label: app.label,
                  note: app.note,
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
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${inr((paise ?? widget.request.amountPaise ?? 0) / 100)} to ${_vendorCtrl.text.trim().isEmpty ? widget.request.payeeName : _vendorCtrl.text.trim()}',
                style: const TextStyle(
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
                'Only tap “Yes” once your UPI app shows the payment as successful.',
                style: TextStyle(
                  fontSize: 11,
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
                label: 'Not yet',
                onPressed: () => Navigator.of(sheetContext).pop(false),
              ),
            ],
          ),
        ),
      ),
    );
    if (saved == true) {
      await _saveTransaction();
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
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Only use this if you paid in another app. It records the transaction in FinStack now.',
                style: TextStyle(color: FinStackColors.onSurfaceVariant),
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
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
      _needsFamily = false;
    });
    final vendorName = _vendorCtrl.text.trim().isEmpty
        ? widget.request.payeeName
        : _vendorCtrl.text.trim();
    final product = _productCtrl.text.trim();
    final data = <String, dynamic>{
      'amountPaise': paise,
      'type': 'EXPENSE',
      'mode': 'UPI',
      'occurredAt': DateTime.now().toIso8601String(),
      'category': _selectedCategory,
      'recipient': {'name': vendorName, 'upiId': widget.request.payeeVpa},
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
      });
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
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _payeeCard(paise),
              const SizedBox(height: 12),
              _amountCard(paise),
              const SizedBox(height: 12),
              _detailsCard(),
              if (_error != null) ...[const SizedBox(height: 12), _errorCard()],
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
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: FinStackColors.onSurface, width: 2),
                ),
                child: const Icon(Icons.qr_code_2, size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  widget.request.payeeName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
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
          const SizedBox(height: 6),
          SelectableText(
            widget.request.payeeVpa,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 11,
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
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1,
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
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Padding(
                padding: EdgeInsets.only(bottom: 6, right: 4),
                child: Text(
                  '₹',
                  style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
              ),
              Expanded(
                child: TextField(
                  controller: _amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => dismissKeyboard(context),
                  onChanged: (_) => setState(() => _error = null),
                  style: const TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                  decoration: const InputDecoration(
                    hintText: '0',
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
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
                fontSize: 12,
                fontWeight: FontWeight.w700,
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
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                    ),
                  ),
                ),
                Text(
                  _selectedCategory.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  _detailsOpen
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  size: 20,
                ),
              ],
            ),
          ),
          if (_detailsOpen) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
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
          Text(
            _error!,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: FinStackColors.onErrorContainer,
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
          top: BorderSide(color: FinStackColors.onSurface, width: 3),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
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
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                          color: FinStackColors.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        inr((paise ?? 0) / 100),
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          height: 1.1,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: _appPrefLoaded ? () => _chooseApp() : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: FinStackColors.surfaceContainer,
                        border: Border.all(
                          color: FinStackColors.onSurface,
                          width: 2,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _preferredAppId == null ? 'Choose app' : appLabel,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.swap_horiz, size: 14),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (_preferredAppId == 'bhim')
                const Padding(
                  padding: EdgeInsets.only(bottom: 6),
                  child: Text(
                    'BHIM 4.0.30 on iPhone rejects personal UPI IDs — switch apps if it errors.',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: FinStackColors.onErrorContainer,
                    ),
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
                    : 'Pay ${inr(paise / 100)} with $appLabel',
                icon: Icons.open_in_new,
                fontSize: 13,
                onPressed: _opening || _saving ? null : _openUpiApp,
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _saving ? null : _confirmDirectSave,
                child: const Text(
                  'ALREADY PAID? SAVE IT',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
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

  Widget _savedView(BuildContext context) {
    final paise = _amountPaise() ?? widget.request.amountPaise ?? 0;
    final savedCategory = '${_savedTxn?['category'] ?? _selectedCategory}';
    final status = '${_savedTxn?['status'] ?? ''}';
    final needsReview = status == 'PENDING_REVIEW';
    final matched = _savedMatched || status == 'RECONCILED';
    return Scaffold(
      appBar: AppBar(
        title: const Text('PAYMENT SAVED'),
        automaticallyImplyLeading: false,
      ),
      body: BrutalGrid(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            BrutalCard(
              color: FinStackColors.brandYellow,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: FinStackColors.onSurface,
                          border: Border.all(
                            color: FinStackColors.onSurface,
                            width: 2,
                          ),
                        ),
                        child: const Icon(
                          Icons.check,
                          color: FinStackColors.brandYellow,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Text(
                          'PAYMENT RECORDED',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      BrutalTag(
                        label: needsReview
                            ? 'Needs review'
                            : matched
                            ? 'Matched'
                            : 'Saved',
                        color: needsReview
                            ? FinStackColors.errorContainer
                            : matched
                            ? FinStackColors.tertiary
                            : Colors.white,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    inr(paise / 100),
                    style: const TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.w900,
                      height: 1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_vendorCtrl.text.trim().isEmpty ? widget.request.payeeName : _vendorCtrl.text.trim()} · ${widget.request.payeeVpa}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            BrutalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const BrutalSectionTitle(
                    title: 'What FinStack stored',
                    accent: FinStackColors.tertiary,
                  ),
                  const SizedBox(height: 12),
                  _SavedRow(label: 'Category', value: savedCategory),
                  _SavedRow(
                    label: 'Vendor',
                    value: _vendorCtrl.text.trim().isEmpty
                        ? widget.request.payeeName
                        : _vendorCtrl.text.trim(),
                  ),
                  _SavedRow(
                    label: 'Vendor status',
                    value: _vendor == null
                        ? 'Created automatically'
                        : 'Matched to existing vendor',
                  ),
                  if (_productCtrl.text.trim().isNotEmpty)
                    _SavedRow(label: 'Item', value: _productCtrl.text.trim()),
                  if (_utrCtrl.text.trim().isNotEmpty)
                    _SavedRow(label: 'UTR', value: _utrCtrl.text.trim()),
                  const _SavedRow(label: 'Mode', value: 'UPI'),
                  if (matched) ...[
                    const _SavedRow(
                      label: 'Bank import',
                      value: 'Linked to an existing bank row',
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: FinStackColors.surfaceContainer,
                        border: Border.all(
                          color: FinStackColors.onSurface,
                          width: 2,
                        ),
                      ),
                      child: const Text(
                        'This payment matched an existing imported bank row. FinStack linked the two entries instead of adding a duplicate.',
                        style: TextStyle(fontSize: 11, height: 1.35),
                      ),
                    ),
                  ],
                  if (needsReview) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'A similar payment already exists, so this one was saved for review instead of being merged automatically.',
                      style: TextStyle(fontSize: 11),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            BrutalButton(
              block: true,
              label: 'Scan another QR',
              icon: Icons.qr_code_scanner,
              onPressed: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 8),
            BrutalButton(
              block: true,
              color: Colors.white,
              label: 'Done',
              onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
            ),
          ],
        ),
      ),
    );
  }
}

class _AppRow extends StatelessWidget {
  final String label;
  final String? note;
  final bool installed;
  final bool selected;
  final VoidCallback onTap;
  const _AppRow({
    required this.label,
    required this.installed,
    required this.selected,
    required this.onTap,
    this.note,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? FinStackColors.brandYellow : Colors.white,
          border: Border.all(color: FinStackColors.onSurface, width: 2),
          boxShadow: const [
            BoxShadow(
              color: FinStackColors.onSurface,
              offset: Offset(2, 2),
              blurRadius: 0,
            ),
          ],
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (note != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      note!,
                      style: const TextStyle(
                        fontSize: 9,
                        height: 1.25,
                        color: FinStackColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (selected)
              const BrutalTag(label: 'Preferred', color: Colors.white)
            else if (installed)
              const BrutalTag(
                label: 'Installed',
                color: FinStackColors.tertiary,
              )
            else if (note != null)
              const BrutalTag(
                label: 'Limited',
                color: FinStackColors.errorContainer,
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
    );
  }
}

class _SavedRow extends StatelessWidget {
  final String label;
  final String value;
  const _SavedRow({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label.toUpperCase(),
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.7,
                color: FinStackColors.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
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
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
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
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.4,
          ),
        ),
      ),
    );
  }
}
