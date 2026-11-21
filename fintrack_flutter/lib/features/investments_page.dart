import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/finance_transactions.dart';
import '../widgets/states.dart';
import '../widgets/workspace.dart';

const _types = ['stock', 'mf_sip', 'fd', 'real_estate', 'other'];
const _tabs = ['all', ..._types];
const _typeLabels = {
  'all': 'All',
  'stock': 'Stocks',
  'mf_sip': 'Mutual funds / SIP',
  'fd': 'Fixed deposits',
  'real_estate': 'Real estate',
  'other': 'Other',
};
const _fundCategories = ['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Other'];
const _statuses = ['Active', 'Matured', 'Closed', 'Broken'];
const _maturityActions = {
  'credit_account': 'Credit principal and interest to an account',
  'renew_principal': 'Renew principal and pay out interest',
  'renew_full': 'Renew principal and interest',
};

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
    if (ok != true || !mounted) return;
    try {
      await ApiClient.dio.delete("/investments/${item['_id'] ?? item['id']}");
      if (mounted) await load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              ApiClient.errorMessage(e, 'Could not delete investment.'),
            ),
          ),
        );
      }
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _InvestmentForm(
        initial: initial,
        onSaved: () {
          Navigator.pop(sheetContext);
          if (mounted) load();
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
                            _typeLabels[value]!.toUpperCase(),
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
    final kind = '${item['investmentType'] ?? 'other'}';
    final isFd = kind == 'fd';
    final invested =
        ((isFd
                ? item['principalAmount'] ?? item['totalInvested']
                : item['totalInvested'])
            as num?) ??
        0;
    final current =
        ((isFd
                ? item['maturityAmount'] ??
                      item['principalAmount'] ??
                      item['currentValue']
                : item['currentValue'])
            as num?) ??
        0;
    final gain = current - invested;
    final maturity = DateTime.tryParse('${item['maturityDate'] ?? ''}');
    final status = '${item['status'] ?? 'Active'}';
    final due =
        status == 'Active' &&
        maturity != null &&
        !maturity.isAfter(DateTime.now());
    final type = isFd ? 'Fixed deposit' : (_typeLabels[kind] ?? kind);
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
          if (isFd) ...[
            if (maturity != null)
              Text(
                'Maturity: ${maturity.toIso8601String().split('T').first} · ${due ? 'Due for confirmation' : status}',
              ),
            if (item['tenureMonths'] != null || item['tenureDays'] != null)
              Text(
                [
                  if ((item['tenureMonths'] ?? 0) != 0)
                    "${item['tenureMonths']} mo",
                  if ((item['tenureDays'] ?? 0) != 0) "${item['tenureDays']} d",
                ].join(' '),
                style: FinStackType.caption,
              ),
            Text(switch (item['maturityAction']) {
              'renew_principal' =>
                'Renew principal for the same term and pay out interest',
              'renew_full' => 'Renew principal and interest for the same term',
              final action =>
                _maturityActions[action] ?? 'Maturity instruction not set',
            }, style: FinStackType.caption),
            if (item['payoutAccount'] != null)
              Text(
                "Payout account: ${item['payoutAccount']}",
                style: FinStackType.caption,
              ),
          ],
          const Divider(height: 7, thickness: 1),
          Row(
            spacing: 8,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _positionValue(
                  isFd ? 'Maturity value' : 'Current',
                  current,
                ),
              ),
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
          if (isFd || kind == 'stock')
            Align(
              alignment: Alignment.centerLeft,
              child: BrutalButton(
                label: 'Transactions',
                color: Colors.white,
                onPressed: () => showFinanceTransactions(
                  context,
                  kind: kind,
                  id: "${item['_id'] ?? item['id']}",
                  name: _nameOf(item),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _positionValue(
    String label,
    num? value, {
    Color color = FinStackColors.onSurface,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(label.toUpperCase(), style: FinStackType.caption),
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          value == null ? '—' : inr(value),
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
      tenureDaysCtrl,
      payoutAccountCtrl,
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
  String? maturityAction;
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
    final months = i?['tenureMonths'];
    tenureCtrl = TextEditingController(
      text: months is num && months == months.round()
          ? '${months.round()}'
          : s(months),
    );
    tenureDaysCtrl = TextEditingController(text: s(i?['tenureDays']));
    payoutAccountCtrl = TextEditingController(text: s(i?['payoutAccount']));
    if (_maturityActions.containsKey(i?['maturityAction'])) {
      maturityAction = i?['maturityAction'] as String;
    }
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

  @override
  void dispose() {
    for (final controller in [
      titleCtrl,
      investedCtrl,
      currentCtrl,
      tickerCtrl,
      buyCtrl,
      qtyCtrl,
      curPriceCtrl,
      fundHouseCtrl,
      sipAmtCtrl,
      sipDateCtrl,
      unitsCtrl,
      navCtrl,
      bankCtrl,
      principalCtrl,
      rateCtrl,
      tenureCtrl,
      tenureDaysCtrl,
      payoutAccountCtrl,
      maturityDateCtrl,
      maturityAmtCtrl,
      assetTypeCtrl,
      purchaseCtrl,
      startCtrl,
      endCtrl,
      notesCtrl,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  double? _num(String value) {
    final parsed = double.tryParse(value.trim());
    return parsed?.isFinite == true ? parsed : null;
  }

  Future<void> pickDate(TextEditingController controller) async {
    final first = DateTime(1900);
    final last = DateTime(2200);
    final candidate = DateTime.tryParse(controller.text) ?? DateTime.now();
    final chosen = await showDatePicker(
      context: context,
      firstDate: first,
      lastDate: last,
      initialDate: candidate.isBefore(first) || candidate.isAfter(last)
          ? DateTime.now()
          : candidate,
    );
    if (chosen == null || !mounted) return;
    setState(() {
      controller.text = chosen.toIso8601String().split('T').first;
      if (controller == startCtrl) maturityDateCtrl.clear();
    });
  }

  Widget dateControl(
    String label,
    TextEditingController controller,
    String hint,
  ) => InputDecorator(
    decoration: InputDecoration(
      labelText: label,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10),
    ),
    child: Row(
      children: [
        Expanded(
          child: TextButton.icon(
            onPressed: () => pickDate(controller),
            icon: const Icon(Icons.calendar_today_outlined, size: 16),
            label: Align(
              alignment: Alignment.centerLeft,
              child: Text(controller.text.isEmpty ? hint : controller.text),
            ),
          ),
        ),
        if (controller == maturityDateCtrl && controller.text.isNotEmpty)
          IconButton(
            tooltip: 'Calculate maturity date from term',
            icon: const Icon(Icons.clear),
            onPressed: () => setState(controller.clear),
          ),
      ],
    ),
  );

  Future<void> save() async {
    final fd = type == 'fd';
    final invested = _num((fd ? principalCtrl : investedCtrl).text);
    if (titleCtrl.text.trim().isEmpty || invested == null || invested <= 0) {
      setState(
        () => error = fd
            ? 'Enter the deposit name and principal.'
            : 'Name and total invested are required.',
      );
      return;
    }
    final months = int.tryParse(
      tenureCtrl.text.trim().isEmpty ? '0' : tenureCtrl.text.trim(),
    );
    final days = int.tryParse(
      tenureDaysCtrl.text.trim().isEmpty ? '0' : tenureDaysCtrl.text.trim(),
    );
    final rate = _num(rateCtrl.text);
    final maturityAmount = _num(maturityAmtCtrl.text);
    if (fd) {
      if (startCtrl.text.isEmpty || rate == null || rate < 0) {
        setState(
          () => error =
              'Choose the opening date and enter the annual interest rate.',
        );
        return;
      }
      if (months == null ||
          days == null ||
          months < 0 ||
          months > 1200 ||
          days < 0 ||
          days > 36500 ||
          months + days <= 0) {
        setState(
          () => error = 'Enter a positive term in whole months, days, or both.',
        );
        return;
      }
      if (maturityAction == null) {
        setState(() => error = 'Choose what the bank should do at maturity.');
        return;
      }
      if (maturityAmtCtrl.text.trim().isNotEmpty &&
          (maturityAmount == null || maturityAmount <= 0)) {
        setState(
          () => error = 'Enter a positive maturity amount or leave it blank.',
        );
        return;
      }
    }
    setState(() {
      busy = true;
      error = null;
    });
    final payload = <String, dynamic>{
      'investmentType': type,
      'totalInvested': invested,
      if (fd)
        'currentValue': maturityAmount ?? invested
      else if (_num(currentCtrl.text) != null)
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
      payload['principalAmount'] = invested;
      payload['interestRate'] = rate;
      payload['tenureMonths'] = months;
      payload['tenureDays'] = days;
      payload['maturityDate'] = maturityDateCtrl.text.isEmpty
          ? null
          : maturityDateCtrl.text;
      payload['maturityAmount'] = maturityAmount;
      payload['maturityAction'] = maturityAction;
      final payout = payoutAccountCtrl.text.trim();
      payload['payoutAccount'] =
          maturityAction == 'renew_full' || payout.isEmpty ? null : payout;
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
      if (mounted) widget.onSaved();
    } catch (e) {
      if (mounted) {
        setState(
          () => error = ApiClient.errorMessage(e, 'Could not save investment.'),
        );
      }
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
    Map<String, String> labels = const {},
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
                  child: Text(c.isEmpty ? 'Select' : labels[c] ?? c),
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
            _drop(
              'Type',
              type,
              _types,
              (v) => setState(() => type = v!),
              labels: _typeLabels,
            ),
            const SizedBox(height: 8),
            if (type != 'fd')
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
              BrutalField(
                label: 'Bank name',
                controller: bankCtrl,
                hint: 'SBI',
              ),
              const SizedBox(height: 8),
              Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Principal ₹',
                      controller: principalCtrl,
                      hint: '100000',
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                  ),
                  Expanded(
                    child: BrutalField(
                      label: 'Annual interest %',
                      controller: rateCtrl,
                      hint: '7',
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              dateControl('Opened on', startCtrl, 'Choose a date'),
              const SizedBox(height: 12),
              Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: BrutalField(
                      label: 'Term (months)',
                      controller: tenureCtrl,
                      hint: '0',
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setState(maturityDateCtrl.clear),
                    ),
                  ),
                  Expanded(
                    child: BrutalField(
                      label: 'Additional days',
                      controller: tenureDaysCtrl,
                      hint: '0',
                      keyboardType: TextInputType.number,
                      onChanged: (_) => setState(maturityDateCtrl.clear),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              dateControl(
                'Maturity date',
                maturityDateCtrl,
                'Calculate from term',
              ),
              const SizedBox(height: 12),
              BrutalField(
                label: 'Bank-quoted maturity amount ₹ (optional)',
                controller: maturityAmtCtrl,
                hint: '0',
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: maturityAction,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'At maturity'),
                items: [
                  for (final action in _maturityActions.entries)
                    DropdownMenuItem(
                      value: action.key,
                      child: Text(
                        action.value,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (value) => setState(() => maturityAction = value),
              ),
              if (maturityAction != null && maturityAction != 'renew_full') ...[
                const SizedBox(height: 8),
                BrutalField(
                  label: 'Payout account nickname (optional)',
                  controller: payoutAccountCtrl,
                  hint: 'Main savings',
                ),
              ],
              const SizedBox(height: 8),
              Text(
                maturityAction?.startsWith('renew_') == true
                    ? 'Renewal is for the same term. Your bank handles the renewal.'
                    : 'FinStack tracks your instruction. Your bank handles the payout or renewal.',
                style: Theme.of(context).textTheme.bodySmall,
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
            if (type != 'fd')
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
