import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

const _types = ['stock', 'mf_sip', 'fd', 'real_estate', 'other'];
const _tabs = ['all', ..._types];
const _fundCategories = ['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Other'];
const _statuses = ['Active', 'Matured', 'Closed', 'Broken'];

String _nameOf(Map m) =>
    '${m['stockName'] ?? m['fundName'] ?? m['assetName'] ?? m['title'] ?? ''}';

/// Mirrors website Investments.tsx: GET (with ?type= filter) / POST / PUT / DELETE
/// /investments with the same type-specific fields, plus GET /investments/summary
/// for the header stats (the web page computes totals client-side instead).
class InvestmentsPage extends StatefulWidget {
  const InvestmentsPage({super.key});
  @override
  State<InvestmentsPage> createState() => _InvestmentsPageState();
}

class _InvestmentsPageState extends State<InvestmentsPage> {
  String tab = 'all';
  List items = [];
  Map<String, dynamic>? summary;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final results = await Future.wait([
        ApiClient.dio.get(
          '/investments',
          queryParameters: {if (tab != 'all') 'type': tab},
        ),
        ApiClient.dio.get('/investments/summary'),
      ]);
      if (!mounted) return;
      final listRes = results[0];
      final sumRes = results[1];
      setState(() {
        items = (listRes.data as List?) ?? [];
        summary = (sumRes.data is Map)
            ? Map<String, dynamic>.from(sumRes.data as Map)
            : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load investments.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete?'),
        content: Text('Delete "${_nameOf(item)}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/investments/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete investment.')),
        );
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _InvestmentForm(
        initial: initial,
        onSaved: () {
          Navigator.pop(context);
          load();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final overall = summary?['overall'];
    final positions = items.whereType<Map>().toList();
    final invested =
        (overall is Map ? overall['totalInvested'] as num? : null) ??
        positions.fold<num>(
          0,
          (sum, item) => sum + ((item['totalInvested'] as num?) ?? 0),
        );
    final current =
        (overall is Map ? overall['totalCurrentValue'] as num? : null) ??
        positions.fold<num>(
          0,
          (sum, item) => sum + ((item['currentValue'] as num?) ?? 0),
        );
    final gain = current - invested;
    final gainColor = gain >= 0
        ? FinStackColors.successInk
        : FinStackColors.onErrorContainer;

    return WorkspaceScaffold(
      title: 'Investments',
      action: BrutalButton(label: '+ Add', onPressed: openForm),
      body: loading
          ? const BrutalLoading(label: 'Loading investments…')
          : error != null
          ? BrutalError(message: error!, onRetry: load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
              children: [
                const WorkspaceIntro(
                  'Portfolio',
                  'Stocks, mutual funds, FDs and real estate.',
                ),
                const SizedBox(height: 12),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 8,
                    children: [
                      Expanded(child: _summaryTile('Invested', inr(invested))),
                      Expanded(
                        child: _summaryTile(
                          'Current',
                          inr(current),
                          color: FinStackColors.brandYellow,
                        ),
                      ),
                      Expanded(
                        child: _summaryTile(
                          'Gain / loss',
                          '${gain > 0 ? '+' : ''}${inr(gain)}',
                          valueColor: gainColor,
                          detail: invested > 0
                              ? '${gain > 0 ? '+' : ''}${(gain / invested * 100).toStringAsFixed(1)}%'
                              : null,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    spacing: 8,
                    children: [
                      for (final value in _tabs)
                        ChoiceChip(
                          label: Text(
                            value.replaceAll('_', ' ').toUpperCase(),
                            style: FinStackType.caption,
                          ),
                          selected: tab == value,
                          onSelected: (selected) {
                            if (!selected) return;
                            setState(() => tab = value);
                            load();
                          },
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                if (positions.isEmpty)
                  BrutalEmpty(
                    icon: Icons.show_chart,
                    message: tab == 'all'
                        ? 'No investments yet. Tap Add to create one.'
                        : 'No investments match this type.',
                  )
                else
                  for (final item in positions)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _investmentCard(item),
                    ),
              ],
            ),
    );
  }

  Widget _summaryTile(
    String label,
    String value, {
    Color color = Colors.white,
    Color valueColor = FinStackColors.onSurface,
    String? detail,
  }) => BrutalCard(
    color: color,
    border: 2,
    shadow: 3,
    padding: const EdgeInsets.all(7),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisAlignment: MainAxisAlignment.center,
      spacing: 4,
      children: [
        Text(label.toUpperCase(), style: FinStackType.caption),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: FinStackType.amount.copyWith(
              fontSize: 15,
              color: valueColor,
            ),
          ),
        ),
        if (detail != null)
          Text(detail, style: FinStackType.caption.copyWith(color: valueColor)),
      ],
    ),
  );

  Widget _investmentCard(Map item) {
    final invested = (item['totalInvested'] as num?) ?? 0;
    final current = (item['currentValue'] as num?) ?? 0;
    final gain = current - invested;
    final type = '${item['investmentType'] ?? 'other'}'.replaceAll('_', ' ');
    return BrutalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
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
                      _nameOf(item),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    BrutalTag(
                      label: type,
                      color: FinStackColors.surfaceContainer,
                    ),
                    if (item['ticker'] != null)
                      Text('${item['ticker']}', style: FinStackType.caption),
                  ],
                ),
              ),
              WorkspaceItemActions(
                onEdit: () =>
                    openForm(initial: Map<String, dynamic>.from(item)),
                onRemove: () => remove(item),
              ),
            ],
          ),
          Wrap(
            spacing: 10,
            runSpacing: 3,
            children: [
              if (item['quantity'] != null)
                Text('Qty: ${item['quantity']}', style: FinStackType.caption),
              if (item['units'] != null)
                Text('Units: ${item['units']}', style: FinStackType.caption),
              if (item['nav'] != null)
                Text('NAV: ${item['nav']}', style: FinStackType.caption),
              if (item['interestRate'] != null)
                Text(
                  'Interest: ${item['interestRate']}%',
                  style: FinStackType.caption,
                ),
              if (item['sipAmount'] is num)
                Text(
                  'SIP: ${inr(item['sipAmount'] as num)}/mo',
                  style: FinStackType.caption,
                ),
              if (item['bankName'] != null)
                Text('Bank: ${item['bankName']}', style: FinStackType.caption),
            ],
          ),
          const Divider(height: 7, thickness: 1),
          Row(
            spacing: 8,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _positionValue('Current', current)),
              Expanded(child: _positionValue('Invested', invested)),
              Expanded(
                child: _positionValue(
                  'Gain / loss',
                  gain,
                  color: gain >= 0
                      ? FinStackColors.successInk
                      : FinStackColors.onErrorContainer,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _positionValue(
    String label,
    num value, {
    Color color = FinStackColors.onSurface,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(label.toUpperCase(), style: FinStackType.caption),
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          inr(value),
          style: FinStackType.amount.copyWith(fontSize: 14, color: color),
        ),
      ),
    ],
  );
}

class _InvestmentForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _InvestmentForm({this.initial, required this.onSaved});
  @override
  State<_InvestmentForm> createState() => _InvestmentFormState();
}

class _InvestmentFormState extends State<_InvestmentForm> {
  late final TextEditingController titleCtrl, investedCtrl, currentCtrl;
  late final TextEditingController tickerCtrl, buyCtrl, qtyCtrl, curPriceCtrl;
  late final TextEditingController fundHouseCtrl,
      sipAmtCtrl,
      sipDateCtrl,
      unitsCtrl,
      navCtrl;
  late final TextEditingController bankCtrl,
      principalCtrl,
      rateCtrl,
      tenureCtrl,
      maturityDateCtrl,
      maturityAmtCtrl;
  late final TextEditingController assetTypeCtrl,
      purchaseCtrl,
      startCtrl,
      endCtrl,
      notesCtrl;
  String type = 'stock';
  String status = 'Active';
  String fundCategory = '';
  String interestType = '';
  bool taxableInterest = false;
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    String s(dynamic v) => v == null ? '' : '$v';
    titleCtrl = TextEditingController(text: i != null ? _nameOf(i) : '');
    investedCtrl = TextEditingController(text: s(i?['totalInvested']));
    currentCtrl = TextEditingController(text: s(i?['currentValue']));
    tickerCtrl = TextEditingController(text: s(i?['ticker']));
    buyCtrl = TextEditingController(text: s(i?['buyPrice']));
    qtyCtrl = TextEditingController(text: s(i?['quantity']));
    curPriceCtrl = TextEditingController(text: s(i?['currentPrice']));
    fundHouseCtrl = TextEditingController(text: s(i?['fundHouse']));
    sipAmtCtrl = TextEditingController(text: s(i?['sipAmount']));
    sipDateCtrl = TextEditingController(text: s(i?['sipDate']));
    unitsCtrl = TextEditingController(text: s(i?['units']));
    navCtrl = TextEditingController(text: s(i?['nav']));
    bankCtrl = TextEditingController(text: s(i?['bankName']));
    principalCtrl = TextEditingController(text: s(i?['principalAmount']));
    rateCtrl = TextEditingController(text: s(i?['interestRate']));
    tenureCtrl = TextEditingController(text: s(i?['tenureMonths']));
    maturityDateCtrl = TextEditingController(
      text: (('${i?['maturityDate'] ?? ''}').length >= 10)
          ? ('${i?['maturityDate']}').substring(0, 10)
          : '',
    );
    maturityAmtCtrl = TextEditingController(text: s(i?['maturityAmount']));
    assetTypeCtrl = TextEditingController(text: s(i?['assetType']));
    purchaseCtrl = TextEditingController(text: s(i?['purchaseValue']));
    startCtrl = TextEditingController(
      text: (('${i?['startDate'] ?? ''}').length >= 10)
          ? ('${i?['startDate']}').substring(0, 10)
          : '',
    );
    endCtrl = TextEditingController(
      text: (i?['endDate'] != null && ('${i?['endDate']}').length >= 10)
          ? ('${i?['endDate']}').substring(0, 10)
          : '',
    );
    notesCtrl = TextEditingController(text: s(i?['notes']));
    if (i?['investmentType'] != null && _types.contains(i!['investmentType'])) {
      type = i['investmentType'];
    }
    if (i?['status'] != null && _statuses.contains(i!['status'])) {
      status = i['status'];
    }
    fundCategory = s(i?['fundCategory']);
    interestType = s(i?['interestType']);
    taxableInterest = (i?['taxableInterest'] ?? false) == true;
  }

  double? _num(String v) => v.trim().isEmpty ? null : double.tryParse(v.trim());

  Future<void> save() async {
    if (titleCtrl.text.trim().isEmpty ||
        (double.tryParse(investedCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Name and total invested are required.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final payload = <String, dynamic>{
      'investmentType': type,
      'totalInvested': double.parse(investedCtrl.text),
      if (_num(currentCtrl.text) != null)
        'currentValue': _num(currentCtrl.text),
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (endCtrl.text.trim().isNotEmpty) 'endDate': endCtrl.text.trim(),
      'status': status,
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    if (type == 'stock') {
      payload['stockName'] = titleCtrl.text.trim();
      if (tickerCtrl.text.trim().isNotEmpty) {
        payload['ticker'] = tickerCtrl.text.trim();
      }
      if (_num(buyCtrl.text) != null) payload['buyPrice'] = _num(buyCtrl.text);
      if (_num(qtyCtrl.text) != null) payload['quantity'] = _num(qtyCtrl.text);
      if (_num(curPriceCtrl.text) != null) {
        payload['currentPrice'] = _num(curPriceCtrl.text);
      }
    } else if (type == 'mf_sip') {
      payload['fundName'] = titleCtrl.text.trim();
      if (fundHouseCtrl.text.trim().isNotEmpty) {
        payload['fundHouse'] = fundHouseCtrl.text.trim();
      }
      if (_num(sipAmtCtrl.text) != null) {
        payload['sipAmount'] = _num(sipAmtCtrl.text);
      }
      if (_num(sipDateCtrl.text) != null) {
        payload['sipDate'] = _num(sipDateCtrl.text);
      }
      if (_num(unitsCtrl.text) != null) payload['units'] = _num(unitsCtrl.text);
      if (_num(navCtrl.text) != null) payload['nav'] = _num(navCtrl.text);
      if (fundCategory.isNotEmpty) payload['fundCategory'] = fundCategory;
    } else if (type == 'fd') {
      payload['assetName'] = titleCtrl.text.trim();
      if (bankCtrl.text.trim().isNotEmpty) {
        payload['bankName'] = bankCtrl.text.trim();
      }
      if (_num(principalCtrl.text) != null) {
        payload['principalAmount'] = _num(principalCtrl.text);
      }
      if (_num(rateCtrl.text) != null) {
        payload['interestRate'] = _num(rateCtrl.text);
      }
      if (_num(tenureCtrl.text) != null) {
        payload['tenureMonths'] = _num(tenureCtrl.text);
      }
      if (maturityDateCtrl.text.trim().isNotEmpty) {
        payload['maturityDate'] = maturityDateCtrl.text.trim();
      }
      if (_num(maturityAmtCtrl.text) != null) {
        payload['maturityAmount'] = _num(maturityAmtCtrl.text);
      }
      if (interestType.isNotEmpty) payload['interestType'] = interestType;
      payload['taxableInterest'] = taxableInterest;
    } else {
      payload['assetName'] = titleCtrl.text.trim();
      if (assetTypeCtrl.text.trim().isNotEmpty) {
        payload['assetType'] = assetTypeCtrl.text.trim();
      }
      if (_num(purchaseCtrl.text) != null) {
        payload['purchaseValue'] = _num(purchaseCtrl.text);
      }
    }
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put(
          "/investments/${widget.initial!['_id'] ?? widget.initial!['id']}",
          data: payload,
        );
      } else {
        await ApiClient.dio.post('/investments', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save investment.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _drop(
    String label,
    String value,
    List<String> options,
    ValueChanged<String?> onChanged, {
    bool allowEmpty = false,
  }) {
    final items = allowEmpty ? [''].followedBy(options).toList() : options;
    final v = items.contains(value) ? value : (allowEmpty ? '' : options.first);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
        DropdownButton<String>(
          value: v,
          isExpanded: true,
          items: items
              .map(
                (c) => DropdownMenuItem(
                  value: c,
                  child: Text(c.isEmpty ? 'Select' : c),
                ),
              )
              .toList(),
          onChanged: onChanged,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
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
            WorkspaceSheetTitle(
              widget.initial != null ? 'EDIT INVESTMENT' : 'ADD INVESTMENT',
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
            BrutalField(
              label: 'Name / Title',
              controller: titleCtrl,
              hint: 'e.g. Infosys, PPFAS Flexi Cap, SBI FD',
            ),
            const SizedBox(height: 8),
            _drop('Type', type, _types, (v) => setState(() => type = v!)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: BrutalField(
                    label: 'Total invested ₹',
                    controller: investedCtrl,
                    hint: '0',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BrutalField(
                    label: 'Current value ₹',
                    controller: currentCtrl,
                    hint: '0',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (type == 'stock') ...[
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Ticker',
                      controller: tickerCtrl,
                      hint: 'INFY',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'Buy price',
                      controller: buyCtrl,
                      hint: '0',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Quantity',
                      controller: qtyCtrl,
                      hint: '0',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'Current price',
                      controller: curPriceCtrl,
                      hint: '0',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            if (type == 'mf_sip') ...[
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Fund house',
                      controller: fundHouseCtrl,
                      hint: 'PPFAS',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _drop(
                      'Fund category',
                      fundCategory,
                      _fundCategories,
                      (v) => setState(() => fundCategory = v ?? ''),
                      allowEmpty: true,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'SIP amount',
                      controller: sipAmtCtrl,
                      hint: '0',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'SIP date (1-28)',
                      controller: sipDateCtrl,
                      hint: '5',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Units',
                      controller: unitsCtrl,
                      hint: '0',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'NAV',
                      controller: navCtrl,
                      hint: '0',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            if (type == 'fd') ...[
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Bank name',
                      controller: bankCtrl,
                      hint: 'SBI',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'Principal ₹',
                      controller: principalCtrl,
                      hint: '0',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Interest %',
                      controller: rateCtrl,
                      hint: '7',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'Tenure (months)',
                      controller: tenureCtrl,
                      hint: '12',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Maturity date',
                      controller: maturityDateCtrl,
                      hint: '2027-01-01',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: BrutalField(
                      label: 'Maturity amt',
                      controller: maturityAmtCtrl,
                      hint: '0',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _drop(
                      'Interest type',
                      interestType,
                      const ['Simple', 'Compound'],
                      (v) => setState(() => interestType = v ?? ''),
                      allowEmpty: true,
                    ),
                  ),
                  Expanded(
                    child: Row(
                      children: [
                        Checkbox(
                          value: taxableInterest,
                          onChanged: (v) =>
                              setState(() => taxableInterest = v ?? false),
                        ),
                        const Text(
                          'Taxable',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            if (type == 'real_estate' || type == 'other') ...[
              BrutalField(
                label: 'Asset type',
                controller: assetTypeCtrl,
                hint: 'Real Estate / Gold / PPF…',
              ),
              const SizedBox(height: 8),
              BrutalField(
                label: 'Purchase value ₹',
                controller: purchaseCtrl,
                hint: '0',
              ),
              const SizedBox(height: 8),
            ],
            Row(
              children: [
                Expanded(
                  child: BrutalField(
                    label: 'Start date',
                    controller: startCtrl,
                    hint: '2026-01-01',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: BrutalField(
                    label: 'End date',
                    controller: endCtrl,
                    hint: '—',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _drop(
              'Status',
              status,
              _statuses,
              (v) => setState(() => status = v!),
            ),
            const SizedBox(height: 8),
            BrutalField(
              label: 'Notes',
              controller: notesCtrl,
              hint: 'Additional details…',
            ),
            const SizedBox(height: 12),
            BrutalButton(
              label: busy ? 'Saving…' : 'Save',
              onPressed: busy ? null : save,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
