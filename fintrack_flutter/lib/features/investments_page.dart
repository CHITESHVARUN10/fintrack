import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _types = ['stock', 'mf_sip', 'fd', 'real_estate', 'other'];
const _tabs = ['all', 'stock', 'mf_sip', 'fd', 'real_estate'];
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
    setState(() { loading = true; error = null; });
    try {
      final results = await Future.wait([
        ApiClient.dio.get('/investments', queryParameters: {if (tab != 'all') 'type': tab}),
        ApiClient.dio.get('/investments/summary'),
      ]);
      if (!mounted) return;
      final listRes = results[0];
      final sumRes = results[1];
      setState(() {
        items = (listRes.data as List?) ?? [];
        summary = (sumRes.data is Map) ? Map<String, dynamic>.from(sumRes.data as Map) : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load investments.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Delete?'),
      content: Text('Delete "${_nameOf(item)}"?'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete'))],
    ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/investments/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete investment.')));
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _InvestmentForm(
      initial: initial,
      onSaved: () { Navigator.pop(context); load(); },
    ));
  }

  @override
  Widget build(BuildContext context) {
    final overall = (summary?['overall'] is Map) ? Map<String, dynamic>.from(summary!['overall'] as Map) : null;
    final invested = ((overall?['totalInvested'] as num?)?.toDouble())
        ?? items.fold<double>(0, (s, e) => s + ((e['totalInvested'] as num?)?.toDouble() ?? 0));
    final current = ((overall?['totalCurrentValue'] as num?)?.toDouble())
        ?? items.fold<double>(0, (s, e) => s + ((e['currentValue'] as num?)?.toDouble() ?? 0));
    final gain = current - invested;
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Expanded(child: Text('INVESTMENTS\nStocks, mutual funds, FDs & real estate.', style: TextStyle(fontSize: 12))),
                    BrutalButton(label: '+ Add', onPressed: () => openForm()),
                  ]),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('INVESTED', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
                      Text('₹${invested.toStringAsFixed(0)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    ]))),
                    const SizedBox(width: 8),
                    Expanded(child: BrutalCard(color: const Color(0xFFFFE500), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('CURRENT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
                      Text('₹${current.toStringAsFixed(0)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    ]))),
                    const SizedBox(width: 8),
                    Expanded(child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('GAIN/LOSS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
                      Text('${gain >= 0 ? '+' : ''}₹${gain.toStringAsFixed(0)}',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: gain >= 0 ? Colors.green[800] : Colors.red)),
                    ]))),
                  ]),
                  const SizedBox(height: 12),
                  SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: _tabs.map((t) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(t.replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                      selected: tab == t,
                      onSelected: (_) { setState(() => tab = t); load(); },
                    ),
                  )).toList())),
                  const SizedBox(height: 12),
                  if (items.isEmpty) const BrutalCard(child: Text('No investments yet. Tap + Add to create one.'))
                  else ...items.map((inv) {
                    final gainEach = ((inv['currentValue'] as num?)?.toDouble() ?? 0) - ((inv['totalInvested'] as num?)?.toDouble() ?? 0);
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(_nameOf(inv), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                            Text('${(inv['investmentType'] ?? 'other')}'.replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 10)),
                          ])),
                          Row(children: [
                            IconButton(icon: const Icon(Icons.edit, size: 18), onPressed: () => openForm(initial: Map<String, dynamic>.from(inv))),
                            IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(inv)),
                          ]),
                        ]),
                        if (inv['ticker'] != null) Text('${inv['ticker']}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Wrap(spacing: 12, runSpacing: 4, children: [
                          if (inv['quantity'] != null) Text('Qty: ${inv['quantity']}', style: const TextStyle(fontSize: 11)),
                          if (inv['units'] != null) Text('Units: ${inv['units']}', style: const TextStyle(fontSize: 11)),
                          if (inv['nav'] != null) Text('NAV: ${inv['nav']}', style: const TextStyle(fontSize: 11)),
                          if (inv['interestRate'] != null) Text('Interest: ${inv['interestRate']}%', style: const TextStyle(fontSize: 11)),
                          if (inv['sipAmount'] != null) Text('SIP: ₹${(inv['sipAmount'] as num).toStringAsFixed(0)}/mo', style: const TextStyle(fontSize: 11)),
                          if (inv['bankName'] != null) Text('Bank: ${inv['bankName']}', style: const TextStyle(fontSize: 11)),
                        ]),
                        const SizedBox(height: 6),
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('CURRENT', style: TextStyle(fontSize: 10)),
                            Text('₹${((inv['currentValue'] as num?) ?? 0).toStringAsFixed(0)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                          ]),
                          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                            const Text('INVESTED', style: TextStyle(fontSize: 10)),
                            Text('₹${((inv['totalInvested'] as num?) ?? 0).toStringAsFixed(0)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                            Text('${gainEach >= 0 ? '+' : ''}₹${gainEach.toStringAsFixed(0)}',
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: gainEach >= 0 ? Colors.green[800] : Colors.red)),
                          ]),
                        ]),
                      ])),
                    );
                  }),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
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
  late final TextEditingController fundHouseCtrl, sipAmtCtrl, sipDateCtrl, unitsCtrl, navCtrl;
  late final TextEditingController bankCtrl, principalCtrl, rateCtrl, tenureCtrl, maturityDateCtrl, maturityAmtCtrl;
  late final TextEditingController assetTypeCtrl, purchaseCtrl, startCtrl, endCtrl, notesCtrl;
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
    maturityDateCtrl = TextEditingController(text: (('${i?['maturityDate'] ?? ''}').length >= 10) ? ('${i?['maturityDate']}').substring(0, 10) : '');
    maturityAmtCtrl = TextEditingController(text: s(i?['maturityAmount']));
    assetTypeCtrl = TextEditingController(text: s(i?['assetType']));
    purchaseCtrl = TextEditingController(text: s(i?['purchaseValue']));
    startCtrl = TextEditingController(text: (('${i?['startDate'] ?? ''}').length >= 10) ? ('${i?['startDate']}').substring(0, 10) : '');
    endCtrl = TextEditingController(text: (i?['endDate'] != null && ('${i?['endDate']}').length >= 10) ? ('${i?['endDate']}').substring(0, 10) : '');
    notesCtrl = TextEditingController(text: s(i?['notes']));
    if (i?['investmentType'] != null && _types.contains(i!['investmentType'])) type = i['investmentType'];
    if (i?['status'] != null && _statuses.contains(i!['status'])) status = i['status'];
    fundCategory = s(i?['fundCategory']);
    interestType = s(i?['interestType']);
    taxableInterest = (i?['taxableInterest'] ?? false) == true;
  }

  double? _num(String v) => v.trim().isEmpty ? null : double.tryParse(v.trim());

  Future<void> save() async {
    if (titleCtrl.text.trim().isEmpty || (double.tryParse(investedCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Name and total invested are required.');
      return;
    }
    setState(() { busy = true; error = null; });
    final payload = <String, dynamic>{
      'investmentType': type,
      'totalInvested': double.parse(investedCtrl.text),
      if (_num(currentCtrl.text) != null) 'currentValue': _num(currentCtrl.text),
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (endCtrl.text.trim().isNotEmpty) 'endDate': endCtrl.text.trim(),
      'status': status,
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    if (type == 'stock') {
      payload['stockName'] = titleCtrl.text.trim();
      if (tickerCtrl.text.trim().isNotEmpty) payload['ticker'] = tickerCtrl.text.trim();
      if (_num(buyCtrl.text) != null) payload['buyPrice'] = _num(buyCtrl.text);
      if (_num(qtyCtrl.text) != null) payload['quantity'] = _num(qtyCtrl.text);
      if (_num(curPriceCtrl.text) != null) payload['currentPrice'] = _num(curPriceCtrl.text);
    } else if (type == 'mf_sip') {
      payload['fundName'] = titleCtrl.text.trim();
      if (fundHouseCtrl.text.trim().isNotEmpty) payload['fundHouse'] = fundHouseCtrl.text.trim();
      if (_num(sipAmtCtrl.text) != null) payload['sipAmount'] = _num(sipAmtCtrl.text);
      if (_num(sipDateCtrl.text) != null) payload['sipDate'] = _num(sipDateCtrl.text);
      if (_num(unitsCtrl.text) != null) payload['units'] = _num(unitsCtrl.text);
      if (_num(navCtrl.text) != null) payload['nav'] = _num(navCtrl.text);
      if (fundCategory.isNotEmpty) payload['fundCategory'] = fundCategory;
    } else if (type == 'fd') {
      payload['assetName'] = titleCtrl.text.trim();
      if (bankCtrl.text.trim().isNotEmpty) payload['bankName'] = bankCtrl.text.trim();
      if (_num(principalCtrl.text) != null) payload['principalAmount'] = _num(principalCtrl.text);
      if (_num(rateCtrl.text) != null) payload['interestRate'] = _num(rateCtrl.text);
      if (_num(tenureCtrl.text) != null) payload['tenureMonths'] = _num(tenureCtrl.text);
      if (maturityDateCtrl.text.trim().isNotEmpty) payload['maturityDate'] = maturityDateCtrl.text.trim();
      if (_num(maturityAmtCtrl.text) != null) payload['maturityAmount'] = _num(maturityAmtCtrl.text);
      if (interestType.isNotEmpty) payload['interestType'] = interestType;
      payload['taxableInterest'] = taxableInterest;
    } else {
      payload['assetName'] = titleCtrl.text.trim();
      if (assetTypeCtrl.text.trim().isNotEmpty) payload['assetType'] = assetTypeCtrl.text.trim();
      if (_num(purchaseCtrl.text) != null) payload['purchaseValue'] = _num(purchaseCtrl.text);
    }
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put("/investments/${widget.initial!['_id'] ?? widget.initial!['id']}", data: payload);
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

  Widget _drop(String label, String value, List<String> options, ValueChanged<String?> onChanged, {bool allowEmpty = false}) {
    final items = allowEmpty ? [''].followedBy(options).toList() : options;
    final v = items.contains(value) ? value : (allowEmpty ? '' : options.first);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
      DropdownButton<String>(value: v, isExpanded: true,
        items: items.map((c) => DropdownMenuItem(value: c, child: Text(c.isEmpty ? 'Select' : c))).toList(),
        onChanged: onChanged),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.initial != null ? 'EDIT INVESTMENT' : 'ADD INVESTMENT', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        if (error != null) ...[const SizedBox(height: 8), Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12))],
        BrutalField(label: 'Name / Title', controller: titleCtrl, hint: 'e.g. Infosys, PPFAS Flexi Cap, SBI FD'),
        const SizedBox(height: 8),
        _drop('Type', type, _types, (v) => setState(() => type = v!)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Total invested ₹', controller: investedCtrl, hint: '0')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Current value ₹', controller: currentCtrl, hint: '0')),
        ]),
        const SizedBox(height: 8),
        if (type == 'stock') ...[
          Row(children: [
            Expanded(child: BrutalField(label: 'Ticker', controller: tickerCtrl, hint: 'INFY')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'Buy price', controller: buyCtrl, hint: '0')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'Quantity', controller: qtyCtrl, hint: '0')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'Current price', controller: curPriceCtrl, hint: '0')),
          ]),
          const SizedBox(height: 8),
        ],
        if (type == 'mf_sip') ...[
          Row(children: [
            Expanded(child: BrutalField(label: 'Fund house', controller: fundHouseCtrl, hint: 'PPFAS')),
            const SizedBox(width: 8),
            Expanded(child: _drop('Fund category', fundCategory, _fundCategories, (v) => setState(() => fundCategory = v ?? ''), allowEmpty: true)),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'SIP amount', controller: sipAmtCtrl, hint: '0')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'SIP date (1-28)', controller: sipDateCtrl, hint: '5')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'Units', controller: unitsCtrl, hint: '0')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'NAV', controller: navCtrl, hint: '0')),
          ]),
          const SizedBox(height: 8),
        ],
        if (type == 'fd') ...[
          Row(children: [
            Expanded(child: BrutalField(label: 'Bank name', controller: bankCtrl, hint: 'SBI')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'Principal ₹', controller: principalCtrl, hint: '0')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'Interest %', controller: rateCtrl, hint: '7')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'Tenure (months)', controller: tenureCtrl, hint: '12')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: BrutalField(label: 'Maturity date', controller: maturityDateCtrl, hint: '2027-01-01')),
            const SizedBox(width: 8),
            Expanded(child: BrutalField(label: 'Maturity amt', controller: maturityAmtCtrl, hint: '0')),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _drop('Interest type', interestType, const ['Simple', 'Compound'], (v) => setState(() => interestType = v ?? ''), allowEmpty: true)),
            Expanded(child: Row(children: [
              Checkbox(value: taxableInterest, onChanged: (v) => setState(() => taxableInterest = v ?? false)),
              const Text('Taxable', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
            ])),
          ]),
          const SizedBox(height: 8),
        ],
        if (type == 'real_estate' || type == 'other') ...[
          BrutalField(label: 'Asset type', controller: assetTypeCtrl, hint: 'Real Estate / Gold / PPF…'),
          const SizedBox(height: 8),
          BrutalField(label: 'Purchase value ₹', controller: purchaseCtrl, hint: '0'),
          const SizedBox(height: 8),
        ],
        Row(children: [
          Expanded(child: BrutalField(label: 'Start date', controller: startCtrl, hint: '2026-01-01')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'End date', controller: endCtrl, hint: '—')),
        ]),
        const SizedBox(height: 8),
        _drop('Status', status, _statuses, (v) => setState(() => status = v!)),
        const SizedBox(height: 8),
        BrutalField(label: 'Notes', controller: notesCtrl, hint: 'Additional details…'),
        const SizedBox(height: 12),
        BrutalButton(label: busy ? 'Saving…' : 'Save', onPressed: busy ? null : save),
        const SizedBox(height: 20),
      ])),
    );
  }
}
