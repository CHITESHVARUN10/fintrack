import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/finance_transactions.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

const _typeLabels = {
  'stock': 'Stock',
  'mf_sip': 'Mutual fund / SIP',
  'fd': 'Fixed deposit',
  'real_estate': 'Real estate',
  'other': 'Other',
};

const _maturityActions = {
  'credit_account': 'Credit principal and interest',
  'renew_principal': 'Renew principal, pay out interest',
  'renew_full': 'Renew principal and interest',
};

String _nameOf(Map data) {
  for (final key in const ['stockName', 'fundName', 'assetName', 'title']) {
    final value = data[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
  }
  return 'Investment';
}

num? _asNum(dynamic raw) {
  if (raw is num) return raw;
  if (raw is String) return num.tryParse(raw.trim());
  return null;
}

String _plainNumber(num value) {
  final text = value.toStringAsFixed(4).replaceFirst(RegExp(r'\.?0+$'), '');
  return text.isEmpty ? '0' : text;
}

String _quantityText(num? value) => value == null ? '—' : _plainNumber(value);

DateTime? _parseDate(dynamic raw) {
  final text = '${raw ?? ''}'.trim();
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}

String _isoDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

class _ValuationSpec {
  const _ValuationSpec(this.key, this.label, this.hint, this.help);

  final String key;
  final String label;
  final String hint;
  final String help;
}

/// Investment detail: GET /investments/:id for remaining/original quantity,
/// sales and confirmed dividends, PUT /investments/:id to refresh the current
/// valuation, and POST /investments/:id/sales to record a sale. Older servers
/// that only expose the list payload fall back to the passed-in holding.
class InvestmentDetailPage extends StatefulWidget {
  const InvestmentDetailPage({
    super.key,
    required this.id,
    this.initial,
    this.onEdit,
    this.onDelete,
    this.onChanged,
  });

  final String id;
  final Map<String, dynamic>? initial;
  final Future<bool> Function(Map<String, dynamic> item)? onEdit;
  final Future<bool> Function(Map<String, dynamic> item)? onDelete;

  /// Called after a sale or valuation change so the portfolio can refresh
  /// underneath this route.
  final VoidCallback? onChanged;

  @override
  State<InvestmentDetailPage> createState() => _InvestmentDetailPageState();
}

class _InvestmentDetailPageState extends State<InvestmentDetailPage> {
  Map<String, dynamic>? _detail;
  List<Map<String, dynamic>> _sales = const [];
  num? _dividendPaise;
  String? _error;
  String? _notice;
  bool _legacy = false;
  int _version = 0;

  late final TextEditingController _valuationCtrl;
  bool _savingValuation = false;
  String? _valuationError;

  String get _type => '${_detail?['investmentType'] ?? 'other'}';

  _ValuationSpec get _valuationSpec => switch (_type) {
    'stock' => const _ValuationSpec(
      'currentPrice',
      'Current price per share ₹',
      'e.g. 1520',
      'Updates the price used to value your holding.',
    ),
    'mf_sip' => const _ValuationSpec(
      'nav',
      'Current NAV ₹',
      'e.g. 45.20',
      'NAV × units becomes the current value.',
    ),
    'fd' => const _ValuationSpec(
      'maturityAmount',
      'Maturity amount ₹',
      'Bank quote',
      'Leave blank if the bank has not quoted one.',
    ),
    _ => const _ValuationSpec(
      'currentValue',
      'Current value ₹',
      'Latest estimate',
      'Used for your portfolio value.',
    ),
  };

  num? get _remaining => _asNum(_detail?['quantity']);
  num? get _original => _asNum(_detail?['originalQuantity']);

  bool get _supportsSales {
    final detail = _detail;
    if (detail == null || _legacy) return false;
    return detail.containsKey('sales') ||
        detail.containsKey('originalQuantity');
  }

  num? get _soldQuantity {
    final original = _original;
    final remaining = _remaining;
    if (original != null && remaining != null) {
      final sold = original - remaining;
      return sold < 0 ? 0 : sold;
    }
    if (_sales.isEmpty) return null;
    return _sales.fold<num>(
      0,
      (sum, sale) => sum + (_asNum(sale['quantity']) ?? 0),
    );
  }

  num get _saleProceeds => _sales.fold<num>(
    0,
    (sum, sale) =>
        sum +
        (_asNum(sale['quantity']) ?? 0) * (_asNum(sale['pricePerShare']) ?? 0),
  );

  @override
  void initState() {
    super.initState();
    _valuationCtrl = TextEditingController();
    if (widget.initial != null) {
      _detail = Map<String, dynamic>.from(widget.initial!);
      _sales = _readSales(_detail!);
      _dividendPaise = _asNum(_detail!['totalDividendPaise']);
    }
    _syncValuation();
    _load();
  }

  @override
  void dispose() {
    _valuationCtrl.dispose();
    super.dispose();
  }

  void _syncValuation() {
    final value = _asNum(_detail?[_valuationSpec.key]);
    _valuationCtrl.text = value == null ? '' : _plainNumber(value);
  }

  List<Map<String, dynamic>> _readSales(Map data) {
    final sales = ((data['sales'] as List?) ?? const [])
        .whereType<Map>()
        .map((sale) => Map<String, dynamic>.from(sale))
        .toList();
    sales.sort((a, b) {
      final left = _parseDate(b['soldAt']) ?? DateTime(1970);
      final right = _parseDate(a['soldAt']) ?? DateTime(1970);
      return left.compareTo(right);
    });
    return sales;
  }

  Future<void> _load() async {
    final version = ++_version;
    if (mounted) setState(() => _error = null);
    try {
      final response = await ApiClient.dio.get<Map>(
        '/investments/${widget.id}',
      );
      final data = response.data;
      if (!mounted || version != _version) return;
      if (data == null) throw StateError('Empty investment');
      final detail = Map<String, dynamic>.from(data);
      setState(() {
        _detail = detail;
        _sales = _readSales(detail);
        _dividendPaise = _asNum(detail['totalDividendPaise']);
        _legacy = false;
        _notice = null;
      });
      _syncValuation();
      if (_asNum(detail['totalDividendPaise']) == null) {
        await _loadLedgerDividends(version);
      }
    } catch (e) {
      if (!mounted || version != _version) return;
      if (_detail == null) {
        setState(
          () => _error = ApiClient.errorMessage(
            e,
            'Could not load this investment.',
          ),
        );
        return;
      }
      final status = e is DioException ? e.response?.statusCode : null;
      setState(() {
        _legacy = true;
        _notice = status == 404 || status == 405
            ? 'This server version cannot show sale history. '
                  'Showing the saved holding.'
            : 'Could not refresh the latest details. '
                  'Showing the saved holding.';
      });
      if (_dividendPaise == null) await _loadLedgerDividends(version);
    }
  }

  Future<void> _loadLedgerDividends(int version) async {
    if (_type != 'stock' && _type != 'mf_sip') return;
    try {
      num total = 0;
      for (var page = 1; page <= 10; page++) {
        final response = await ApiClient.dio.get(
          '/investments/${widget.id}/transactions',
          queryParameters: {'view': 'linked', 'page': page},
        );
        final data = response.data;
        final items = data is Map ? data['items'] : null;
        if (!mounted || version != _version || items is! List) return;
        for (final row in items.whereType<Map>()) {
          final link = row['financeLink'];
          if (link is Map && '${link['role'] ?? ''}' != 'dividend') continue;
          if (link is! Map) continue;
          total += _asNum(row['amountPaise']) ?? 0;
        }
        if (data is! Map || data['hasMore'] != true) break;
      }
      setState(() => _dividendPaise = total);
    } catch (_) {
      // Older servers do not expose dividend totals; leave the tile hidden.
    }
  }

  num? _investedValue(Map<String, dynamic> detail) {
    switch (_type) {
      case 'stock':
        final buyPrice = _asNum(detail['buyPrice']);
        final quantity =
            _asNum(detail['originalQuantity']) ?? _asNum(detail['quantity']);
        if (buyPrice != null && quantity != null) return buyPrice * quantity;
        return _asNum(detail['totalInvested']);
      case 'fd':
        return _asNum(detail['principalAmount']) ??
            _asNum(detail['totalInvested']);
      case 'mf_sip':
        return _asNum(detail['totalInvested']) ?? _asNum(detail['sipAmount']);
      default:
        return _asNum(detail['totalInvested']) ??
            _asNum(detail['purchaseValue']);
    }
  }

  num? _estimatedValue(Map<String, dynamic> detail) {
    switch (_type) {
      case 'stock':
        final price = _asNum(detail['currentPrice']);
        final quantity = _asNum(detail['quantity']);
        if (price != null && quantity != null) return price * quantity;
        return _asNum(detail['currentValue']);
      case 'mf_sip':
        final units = _asNum(detail['units']);
        final nav = _asNum(detail['nav']);
        if (units != null && nav != null) return units * nav;
        return _asNum(detail['currentValue']);
      case 'fd':
        return _asNum(detail['maturityAmount']) ??
            _asNum(detail['principalAmount']);
      default:
        return _asNum(detail['currentValue']) ??
            _asNum(detail['purchaseValue']);
    }
  }

  String? _valuationBasis(Map<String, dynamic> detail) {
    if (_type == 'stock') {
      final price = _asNum(detail['currentPrice']);
      final quantity = _asNum(detail['quantity']);
      if (price != null && quantity != null) {
        return '${inrPaise(price * 100)} × ${_quantityText(quantity)} shares remaining';
      }
    }
    if (_type == 'mf_sip') {
      final units = _asNum(detail['units']);
      final nav = _asNum(detail['nav']);
      if (units != null && nav != null) {
        return '${_quantityText(units)} units × ${inr(nav)} NAV';
      }
    }
    return null;
  }

  List<(String, String)> _facts(Map<String, dynamic> detail) {
    final rows = <(String, String)>[];
    void add(String label, Object? value) {
      if (value == null) return;
      final text = '$value'.trim();
      if (text.isEmpty) return;
      rows.add((label, text));
    }

    void addMoney(String label, dynamic raw) {
      final value = _asNum(raw);
      if (value != null) add(label, inr(value));
    }

    void addDate(String label, dynamic raw) {
      final date = _parseDate(raw);
      if (date != null) add(label, dateLabel(date));
    }

    switch (_type) {
      case 'stock':
        add('Ticker', detail['ticker']);
        addMoney('Buy price', detail['buyPrice']);
        addMoney('Current price', detail['currentPrice']);
      case 'mf_sip':
        add('Fund house', detail['fundHouse']);
        add('Fund category', detail['fundCategory']);
        addMoney('SIP amount', detail['sipAmount']);
        final sipDay = _asNum(detail['sipDate']);
        if (sipDay != null) add('SIP day', _plainNumber(sipDay));
        final units = _asNum(detail['units']);
        if (units != null) add('Units', _plainNumber(units));
        addMoney('NAV', detail['nav']);
        addMoney('Total invested', detail['totalInvested']);
      case 'fd':
        add('Bank name', detail['bankName']);
        addMoney('Principal', detail['principalAmount']);
        final rate = _asNum(detail['interestRate']);
        if (rate != null) add('Interest rate', '${_plainNumber(rate)}% p.a.');
        add('Interest type', detail['interestType']);
        addDate('Opened on', detail['startDate']);
        final months = _asNum(detail['tenureMonths']) ?? 0;
        final days = _asNum(detail['tenureDays']) ?? 0;
        if (months > 0 || days > 0) {
          add(
            'Term',
            [
              if (months > 0) '${_plainNumber(months)} mo',
              if (days > 0) '${_plainNumber(days)} d',
            ].join(' · '),
          );
        }
        addDate('Maturity', detail['maturityDate']);
        addMoney('Maturity amount', detail['maturityAmount']);
        add(
          'At maturity',
          _maturityActions['${detail['maturityAction'] ?? ''}'],
        );
        add('Payout account', detail['payoutAccount']);
        final taxable = detail['taxableInterest'];
        if (taxable is bool) {
          add('Interest tax', taxable ? 'Taxable' : 'Not taxable');
        }
      default:
        add('Asset type', detail['assetType']);
        addMoney('Purchase value', detail['purchaseValue']);
        addMoney('Total invested', detail['totalInvested']);
    }

    add('Status', detail['status'] ?? 'Active');
    if (_type != 'fd') addDate('Start date', detail['startDate']);
    addDate('End date', detail['endDate']);

    return rows;
  }

  String _appBarTitle(String name) {
    final trimmed = name.trim();
    if (trimmed.length <= 30) return trimmed;
    return '${trimmed.substring(0, 29)}…';
  }

  Widget _statusTag(Map<String, dynamic> detail) {
    final status = '${detail['status'] ?? 'Active'}';
    final active = status.toLowerCase() == 'active';
    return BrutalTag(
      label: status,
      color: active
          ? FinStackColors.successContainer
          : FinStackColors.surfaceContainer,
      textColor: active ? FinStackColors.successInk : FinStackColors.onSurface,
    );
  }

  Future<void> _edit() async {
    final handler = widget.onEdit;
    final detail = _detail;
    if (handler == null || detail == null) return;
    final saved = await handler(Map<String, dynamic>.from(detail));
    if (!mounted || !saved) return;
    await _load();
  }

  Future<void> _remove() async {
    final handler = widget.onDelete;
    final detail = _detail;
    if (handler == null || detail == null) return;
    final deleted = await handler(Map<String, dynamic>.from(detail));
    if (!mounted) return;
    if (deleted) Navigator.of(context).maybePop();
  }

  Future<void> _saveValuation() async {
    final raw = _valuationCtrl.text.trim();
    final spec = _valuationSpec;
    if (_type == 'fd' && raw.isEmpty) {
      setState(() {
        _savingValuation = true;
        _valuationError = null;
      });
      try {
        final response = await ApiClient.dio.put(
          '/investments/${widget.id}',
          data: <String, dynamic>{'maturityAmount': null},
        );
        if (!mounted) return;
        final updated = response.data;
        if (updated is Map) {
          final detail = Map<String, dynamic>.from(updated);
          setState(() {
            _detail = detail;
            _sales = _readSales(detail);
            _dividendPaise = _asNum(detail['totalDividendPaise']);
          });
          _syncValuation();
        } else {
          await _load();
        }
        if (!mounted) return;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Valuation cleared.')));
        widget.onChanged?.call();
      } catch (e) {
        if (mounted) {
          setState(
            () => _valuationError = ApiClient.errorMessage(
              e,
              'Could not clear the valuation.',
            ),
          );
        }
      } finally {
        if (mounted) setState(() => _savingValuation = false);
      }
      return;
    }
    final value = _asNum(raw);
    if (value == null || !value.isFinite || value < 0) {
      setState(() => _valuationError = 'Enter a valid amount.');
      return;
    }
    setState(() {
      _savingValuation = true;
      _valuationError = null;
    });
    try {
      final payload = <String, dynamic>{spec.key: value};
      if (_type == 'mf_sip') {
        final units = _asNum(_detail?['units']);
        if (units != null && units > 0) payload['currentValue'] = value * units;
      }
      final response = await ApiClient.dio.put(
        '/investments/${widget.id}',
        data: payload,
      );
      if (!mounted) return;
      final updated = response.data;
      if (updated is Map) {
        final detail = Map<String, dynamic>.from(updated);
        setState(() {
          _detail = detail;
          _sales = _readSales(detail);
          _dividendPaise = _asNum(detail['totalDividendPaise']);
        });
        _syncValuation();
      } else {
        await _load();
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Valuation updated.')));
      widget.onChanged?.call();
    } catch (e) {
      if (mounted) {
        setState(
          () => _valuationError = ApiClient.errorMessage(
            e,
            'Could not update the valuation.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _savingValuation = false);
    }
  }

  Future<void> _openSale() async {
    final detail = _detail;
    if (detail == null) return;
    final recorded = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _RecordSaleSheet(
        investmentId: widget.id,
        name: _nameOf(detail),
        remaining: _remaining,
        lastPrice: _asNum(detail['currentPrice']),
      ),
    );
    if (!mounted || recorded != true) return;
    await _load();
    if (!mounted) return;
    widget.onChanged?.call();
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Sale recorded.')));
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    final notice =
        _notice ??
        (_type == 'stock' && detail != null && !_supportsSales
            ? 'Sale tracking is unavailable on this server version.'
            : null);
    return WorkspaceScaffold(
      title: _appBarTitle(detail == null ? 'Investment' : _nameOf(detail)),
      action: detail == null ? null : _statusTag(detail),
      body: detail == null
          ? (_error != null
                ? BrutalError(message: _error!, onRetry: _load)
                : const BrutalLoading(label: 'Loading investment…'))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
                children: [
                  _headerCard(detail),
                  const SizedBox(height: 12),
                  if (notice != null) ...[
                    _noticeCard(notice),
                    const SizedBox(height: 12),
                  ],
                  _valueCard(detail),
                  const SizedBox(height: 12),
                  if (_type == 'stock' && _original != null) ...[
                    _positionCard(),
                    const SizedBox(height: 12),
                  ],
                  _valuationCard(),
                  const SizedBox(height: 12),
                  if (_facts(detail).isNotEmpty) ...[
                    _factsCard(detail),
                    const SizedBox(height: 12),
                  ],
                  if (_dividendPaise != null) ...[
                    _dividendCard(),
                    const SizedBox(height: 12),
                  ],
                  if (_type == 'stock' || _sales.isNotEmpty) ...[
                    _salesSection(),
                    const SizedBox(height: 12),
                  ],
                  if (_type == 'stock' || _type == 'fd') ...[
                    BrutalButton(
                      label: 'Transactions',
                      icon: Icons.receipt_long_outlined,
                      color: FinStackColors.surface,
                      block: true,
                      onPressed: () => showFinanceTransactions(
                        context,
                        kind: _type,
                        id: widget.id,
                        name: _nameOf(detail),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if ('${detail['notes'] ?? ''}'.trim().isNotEmpty)
                    _notesCard(detail),
                ],
              ),
            ),
    );
  }

  Widget _headerCard(Map<String, dynamic> detail) => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 10,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text(
                    (_typeLabels[_type] ?? 'Investment').toUpperCase(),
                    style: FinStackType.caption,
                  ),
                  Text(
                    _nameOf(detail),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if ('${detail['ticker'] ?? ''}'.trim().isNotEmpty)
                    Text('${detail['ticker']}', style: FinStackType.caption),
                ],
              ),
            ),
            if (widget.onEdit != null || widget.onDelete != null)
              WorkspaceItemActions(onEdit: _edit, onRemove: _remove),
          ],
        ),
      ],
    ),
  );

  Widget _noticeCard(String text) => BrutalCard(
    color: FinStackColors.surfaceContainer,
    border: 2,
    shadow: 0,
    padding: const EdgeInsets.all(10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 8,
      children: [
        const Icon(Icons.info_outline, size: 17),
        Expanded(
          child: Text(
            text,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: FinStackColors.onSurface),
          ),
        ),
      ],
    ),
  );

  Widget _valueCard(Map<String, dynamic> detail) {
    final current = _estimatedValue(detail);
    final invested = _investedValue(detail);
    final realised = _type == 'stock' && _sales.isNotEmpty ? _saleProceeds : 0;
    final total = current == null ? null : current + realised;
    final gain = total != null && invested != null ? total - invested : null;
    final percent = gain != null && invested != null && invested != 0
        ? gain / invested * 100
        : null;
    final gainColor = gain != null && gain < 0
        ? FinStackColors.accentPink
        : FinStackColors.accentGreen;
    final label = switch (_type) {
      'fd' => 'Maturity value',
      'stock' || 'mf_sip' => 'Current value',
      _ => 'Current / estimated value',
    };
    final basis = _valuationBasis(detail);
    return BrutalCard(
      color: FinStackColors.inverseSurface,
      shadowColor: FinStackColors.brandYellow,
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            label.toUpperCase(),
            style: FinStackType.caption.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 3),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              current == null ? '—' : inr(current),
              style: FinStackType.amount.copyWith(
                fontSize: 28,
                color: Colors.white,
              ),
            ),
          ),
          if (basis != null) ...[
            const SizedBox(height: 3),
            Text(
              basis,
              style: FinStackType.caption.copyWith(color: Colors.white70),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _darkMetric(
                  'Invested',
                  invested == null ? '—' : inr(invested),
                ),
              ),
              Expanded(
                child: _darkMetric(
                  'Gain / loss',
                  gain == null ? '—' : '${gain > 0 ? '+' : ''}${inr(gain)}',
                  color: gainColor,
                ),
              ),
              if (percent != null)
                Expanded(
                  child: _darkMetric(
                    'Return',
                    '${percent > 0 ? '+' : ''}${percent.toStringAsFixed(1)}%',
                    color: gainColor,
                  ),
                ),
            ],
          ),
          if (realised > 0) ...[
            const SizedBox(height: 8),
            Text(
              'Includes ${inr(realised)} from recorded sales.',
              style: FinStackType.caption.copyWith(color: Colors.white70),
            ),
          ],
        ],
      ),
    );
  }

  Widget _darkMetric(
    String label,
    String value, {
    Color color = Colors.white,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label.toUpperCase(),
        style: FinStackType.caption.copyWith(color: Colors.white70),
      ),
      const SizedBox(height: 2),
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          value,
          style: FinStackType.amount.copyWith(fontSize: 15, color: color),
        ),
      ),
    ],
  );

  Widget _positionCard() {
    final remaining = _remaining;
    final original = _original;
    final ratio = remaining != null && original != null && original > 0
        ? (remaining / original).clamp(0.0, 1.0).toDouble()
        : 0.0;
    return BrutalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          const BrutalSectionTitle(title: 'Position'),
          Row(
            children: [
              Expanded(
                child: _positionMetric('Remaining', _quantityText(remaining)),
              ),
              Expanded(
                child: _positionMetric('Original', _quantityText(original)),
              ),
              Expanded(
                child: _positionMetric('Sold', _quantityText(_soldQuantity)),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.all(2),
            decoration: brutal(
              color: FinStackColors.surface,
              border: 1.5,
              shadow: 0,
            ),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 9,
              color: FinStackColors.brandYellow,
              backgroundColor: FinStackColors.surfaceContainer,
            ),
          ),
        ],
      ),
    );
  }

  Widget _positionMetric(String label, String value) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label.toUpperCase(), style: FinStackType.caption),
      const SizedBox(height: 2),
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(value, style: FinStackType.amount.copyWith(fontSize: 15)),
      ),
    ],
  );

  Widget _valuationCard() => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BrutalSectionTitle(title: 'Update valuation'),
        const SizedBox(height: 4),
        Text(_valuationSpec.help, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: BrutalField(
                label: _valuationSpec.label,
                controller: _valuationCtrl,
                hint: _valuationSpec.hint,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            BrutalButton(
              label: _savingValuation ? 'Saving…' : 'Update',
              onPressed: _savingValuation ? null : _saveValuation,
            ),
          ],
        ),
        if (_valuationError != null) ...[
          const SizedBox(height: 8),
          Text(
            _valuationError!,
            style: TextStyle(
              color: FinStackColors.onErrorContainer,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    ),
  );

  Widget _factsCard(Map<String, dynamic> detail) => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BrutalSectionTitle(title: 'Holding details'),
        const SizedBox(height: 4),
        for (final (label, value) in _facts(detail))
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 4,
                  child: Text(label.toUpperCase(), style: FinStackType.caption),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 5,
                  child: Text(
                    value,
                    textAlign: TextAlign.end,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );

  Widget _dividendCard() => BrutalCard(
    color: FinStackColors.successContainer,
    child: Row(
      spacing: 10,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: brutal(
            color: FinStackColors.surface,
            border: 2,
            shadow: 0,
          ),
          child: const Icon(Icons.savings_outlined, size: 19),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 3,
            children: [
              Text(
                'TOTAL CONFIRMED DIVIDENDS',
                style: FinStackType.caption.copyWith(
                  color: FinStackColors.successInk,
                ),
              ),
              Text(
                inrPaise(_dividendPaise ?? 0),
                style: FinStackType.amount.copyWith(
                  fontSize: 17,
                  color: FinStackColors.successInk,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _salesSection() {
    final canSell =
        _type == 'stock' && _supportsSales && ((_remaining ?? 1) > 0);
    final count = _sales.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BrutalSectionTitle(
          title: 'Sale history',
          subtitle: count == 0
              ? null
              : '$count sale${count == 1 ? '' : 's'} · '
                    '${inrPaise(_saleProceeds * 100)} proceeds',
          accent: FinStackColors.accentOrange,
          trailing: _type == 'stock' && _supportsSales
              ? BrutalButton(
                  label: 'Record sale',
                  icon: Icons.sell_outlined,
                  fontSize: 10.5,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 9,
                  ),
                  onPressed: canSell ? _openSale : null,
                )
              : null,
        ),
        const SizedBox(height: 8),
        if (_sales.isEmpty)
          BrutalCard(
            color: FinStackColors.surfaceContainer,
            border: 2,
            shadow: 0,
            padding: const EdgeInsets.all(10),
            child: Text(
              _type != 'stock'
                  ? 'No sales recorded.'
                  : _supportsSales
                  ? 'No shares sold yet.'
                  : 'Sale history will appear once the server supports it.',
            ),
          )
        else
          for (final sale in _sales)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _saleCard(sale),
            ),
      ],
    );
  }

  Widget _saleCard(Map<String, dynamic> sale) {
    final quantity = _asNum(sale['quantity']);
    final price = _asNum(sale['pricePerShare']);
    final proceeds = (quantity ?? 0) * (price ?? 0);
    final soldAt = _parseDate(sale['soldAt']);
    return BrutalCard(
      border: 2,
      shadow: 2,
      padding: const EdgeInsets.all(10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 3,
              children: [
                Text(
                  '${_quantityText(quantity)} '
                  '${_type == 'mf_sip' ? 'units' : 'shares'} × '
                  '${price == null ? '—' : inrPaise(price * 100)}',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  soldAt == null ? 'Date not recorded' : dateLabel(soldAt),
                  style: FinStackType.caption,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: 3,
            children: [
              Text(
                inrPaise(proceeds * 100),
                style: FinStackType.amount.copyWith(fontSize: 14),
              ),
              Text('PROCEEDS', style: FinStackType.caption),
            ],
          ),
        ],
      ),
    );
  }

  Widget _notesCard(Map<String, dynamic> detail) => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BrutalSectionTitle(title: 'Notes'),
        const SizedBox(height: 8),
        Text('${detail['notes']}'),
      ],
    ),
  );
}

class _RecordSaleSheet extends StatefulWidget {
  const _RecordSaleSheet({
    required this.investmentId,
    required this.name,
    required this.remaining,
    required this.lastPrice,
  });

  final String investmentId;
  final String name;
  final num? remaining;
  final num? lastPrice;

  @override
  State<_RecordSaleSheet> createState() => _RecordSaleSheetState();
}

class _RecordSaleSheetState extends State<_RecordSaleSheet> {
  late final TextEditingController _quantityCtrl;
  late final TextEditingController _priceCtrl;
  late final String _requestId;
  DateTime _soldAt = DateTime.now();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _quantityCtrl = TextEditingController();
    _priceCtrl = TextEditingController(
      text: widget.lastPrice == null ? '' : _plainNumber(widget.lastPrice!),
    );
    _requestId =
        'sale-${DateTime.now().microsecondsSinceEpoch}-'
        '${Random().nextInt(0x7fffffff).toRadixString(16)}';
  }

  @override
  void dispose() {
    _quantityCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = DateTime.now();
    final chosen = await showDatePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: today,
      initialDate: _soldAt.isAfter(today) ? today : _soldAt,
    );
    if (chosen == null || !mounted) return;
    setState(() => _soldAt = chosen);
  }

  Future<void> _submit() async {
    final quantity = _asNum(_quantityCtrl.text.trim());
    final price = _asNum(_priceCtrl.text.trim());
    final remaining = widget.remaining;
    if (quantity == null || !quantity.isFinite || quantity <= 0) {
      setState(() => _error = 'Enter the number of shares you sold.');
      return;
    }
    if (remaining != null && quantity > remaining + 1e-9) {
      setState(
        () => _error =
            'You can sell at most ${_quantityText(remaining)} remaining shares.',
      );
      return;
    }
    if (price == null || !price.isFinite || price < 0) {
      setState(() => _error = 'Enter a price per share of zero or more.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient.dio.post(
        '/investments/${widget.investmentId}/sales',
        data: {
          'quantity': quantity,
          'pricePerShare': price,
          'soldAt': _isoDate(_soldAt),
          'requestId': _requestId,
        },
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(
        () => _error = ApiClient.errorMessage(e, 'Could not record the sale.'),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final quantity = _asNum(_quantityCtrl.text.trim());
    final price = _asNum(_priceCtrl.text.trim());
    final proceeds =
        quantity != null && price != null && quantity > 0 && price > 0
        ? quantity * price
        : null;
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const WorkspaceSheetTitle('Record a sale'),
            Text(widget.name, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 3),
            Text(
              widget.remaining == null
                  ? 'Enter the shares you sold and the price you received.'
                  : 'Remaining: ${_quantityText(widget.remaining)} shares · '
                        '${inrPaise((widget.lastPrice ?? 0) * 100)} last price',
              style: FinStackType.caption,
            ),
            const SizedBox(height: 12),
            if (_error != null) ...[
              Text(
                _error!,
                style: TextStyle(
                  color: FinStackColors.onErrorContainer,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
            ],
            BrutalField(
              key: const Key('sale-quantity'),
              label: 'Shares sold',
              controller: _quantityCtrl,
              hint: '0',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            BrutalField(
              key: const Key('sale-price'),
              label: 'Price per share ₹',
              controller: _priceCtrl,
              hint: '0',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Sold on',
                contentPadding: EdgeInsets.symmetric(horizontal: 10),
              ),
              child: TextButton.icon(
                onPressed: _busy ? null : _pickDate,
                icon: const Icon(Icons.calendar_today_outlined, size: 16),
                label: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(dateLabel(_soldAt)),
                ),
              ),
            ),
            const SizedBox(height: 12),
            BrutalCard(
              color: FinStackColors.surfaceContainer,
              border: 2,
              shadow: 0,
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Expanded(
                    child: Text('SALE PROCEEDS', style: FinStackType.caption),
                  ),
                  Text(
                    proceeds == null ? '—' : inrPaise(proceeds * 100),
                    style: FinStackType.amount.copyWith(fontSize: 16),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            BrutalButton(
              label: _busy ? 'Recording…' : 'Confirm sale',
              onPressed: _busy ? null : _submit,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
