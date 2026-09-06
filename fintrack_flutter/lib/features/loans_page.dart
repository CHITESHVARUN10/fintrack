import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

const _loanTypes = ['Home', 'Car', 'Personal', 'Education', 'Gold', 'Other'];
const _loanStatuses = ['Active', 'Closed', 'Prepaid'];

/// Mirrors website Loans.tsx + LoanDetail.tsx:
/// GET /loans, GET /loans/:id, GET /loans/:id/schedule,
/// POST /loans/calculate, GET /loans/suggestions (+ apply/dismiss),
/// POST /loans, PUT /loans/:id, DELETE /loans/:id.
class LoansPage extends StatefulWidget {
  const LoansPage({super.key});
  @override
  State<LoansPage> createState() => _LoansPageState();
}

class _LoansPageState extends State<LoansPage> {
  List items = [];
  List suggestions = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (mounted) setState(() { loading = true; error = null; });
    try {
      final res = await ApiClient.dio.get('/loans');
      if (!mounted) return;
      setState(() => items = (res.data as List?) ?? []);
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load loans.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
    loadSuggestions();
  }

  Future<void> loadSuggestions() async {
    try {
      final res = await ApiClient.dio.get('/loans/suggestions');
      if (!mounted) return;
      final data = res.data;
      final list = (data is Map) ? (data['suggestions'] as List?) ?? [] : (data as List?) ?? [];
      setState(() => suggestions = list);
    } catch (_) {
      // Suggestions are best-effort; keep the list usable without them.
    }
  }

  String _idOf(Map item) => '${item['_id'] ?? item['id']}';

  Future<void> applySuggestion(Map s) async {
    final id = s['loanId'] ?? s['loan'] ?? s['_id'] ?? s['id'];
    if (id == null) return;
    try {
      await ApiClient.dio.post('/loans/$id/apply-suggestion', data: {
        if (s['acceptAmount'] != null) 'acceptAmount': s['acceptAmount'],
        if (s['acceptDate'] != null) 'acceptDate': s['acceptDate'],
        if (s['matchedTxIds'] != null) 'matchedTxIds': s['matchedTxIds'],
      });
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not apply suggestion.')));
    }
  }

  Future<void> dismissSuggestion(Map s) async {
    final id = s['loanId'] ?? s['loan'] ?? s['_id'] ?? s['id'];
    if (id == null) {
      if (mounted) setState(() => suggestions = List.from(suggestions)..remove(s));
      return;
    }
    try {
      await ApiClient.dio.post('/loans/$id/dismiss-suggestion', data: {});
      await loadSuggestions();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not dismiss suggestion.')));
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Delete?'),
      content: Text('Delete "${item['loanName']}"?'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete'))],
    ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete('/loans/${_idOf(item)}');
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete loan.')));
    }
  }

  void openForm({Map? initial}) {
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _LoanForm(
      initial: initial,
      onSaved: () { Navigator.pop(context); load(); },
    ));
  }

  void openDetail(Map item) {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => LoanDetailPage(loanId: _idOf(item)),
    )).then((_) => load());
  }

  @override
  Widget build(BuildContext context) {
    final totalOutstanding = items.fold<double>(0, (s, e) => s + ((e['outstandingAmount'] as num?)?.toDouble() ?? 0));
    final totalEmi = items.fold<double>(0, (s, e) => s + ((e['emiAmount'] as num?)?.toDouble() ?? 0));
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    const Expanded(child: Text('EMI & LOANS\nTrack principal, interest and monthly EMIs.', style: TextStyle(fontSize: 12))),
                    BrutalButton(label: '+ Add', onPressed: () => openForm()),
                  ]),
                  const SizedBox(height: 12),
                  if (suggestions.isNotEmpty) ...[
                    BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('SUGGESTIONS (${suggestions.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      ...suggestions.map((raw) {
                        final s = Map<String, dynamic>.from(raw as Map);
                        return Container(margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(border: Border.all(width: 2)),
                          child: Row(children: [
                            Expanded(child: Text('${s['loanName'] ?? s['name'] ?? 'Suggested loan'} · ₹${((s['emiAmount'] ?? s['amount'] as num?) ?? 0).toStringAsFixed(0)}',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))),
                            TextButton(onPressed: () => applySuggestion(s), child: const Text('Apply')),
                            TextButton(onPressed: () => dismissSuggestion(s), child: const Text('Dismiss')),
                          ]));
                      }),
                    ])),
                    const SizedBox(height: 12),
                  ],
                  if (items.isEmpty) const BrutalCard(child: Text('No loans yet. Tap + Add to create one.'))
                  else ...items.map((raw) {
                    final loan = Map<String, dynamic>.from(raw as Map);
                    final principal = ((loan['principalAmount'] as num?) ?? 0).toDouble();
                    final outstanding = ((loan['outstandingAmount'] as num?) ?? 0).toDouble();
                    final pct = principal > 0 ? (((principal - outstanding) / principal) * 100).round().clamp(0, 100) : 0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: BrutalCard(child: InkWell(onTap: () => openDetail(loan), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Expanded(child: Text('${loan['loanName'] ?? ''}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
                          Row(children: [
                            IconButton(icon: const Icon(Icons.edit, size: 18), onPressed: () => openForm(initial: loan)),
                            IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(loan)),
                          ]),
                        ]),
                        Text('${loan['lender'] ?? ''} · ${loan['loanType'] ?? 'Other'}', style: const TextStyle(fontSize: 11)),
                        const SizedBox(height: 6),
                        Text('₹${outstanding.toStringAsFixed(0)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                        Text('EMI ₹${((loan['emiAmount'] as num?) ?? 0).toStringAsFixed(0)} · Day ${loan['emiDate'] ?? 1} · ${loan['status'] ?? 'Active'}',
                          style: const TextStyle(fontSize: 11)),
                        const SizedBox(height: 6),
                        LinearProgressIndicator(value: pct / 100),
                        Text('$pct% repaid', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        const Text('Tap for schedule & EMI calculator →', style: TextStyle(fontSize: 11, decoration: TextDecoration.underline)),
                      ]))),
                    );
                  }),
                  const SizedBox(height: 8),
                  Container(padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.black, border: Border.all(width: 3)),
                    child: Column(children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('TOTAL OUTSTANDING', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                        Text('₹${totalOutstanding.toStringAsFixed(0)}', style: const TextStyle(color: Colors.redAccent, fontSize: 20, fontWeight: FontWeight.w900)),
                      ]),
                      const SizedBox(height: 8),
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('TOTAL MONTHLY EMI', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                        Text('₹${totalEmi.toStringAsFixed(0)}', style: const TextStyle(color: Color(0xFFFFE500), fontSize: 20, fontWeight: FontWeight.w900)),
                      ]),
                    ])),
                ]),
      floatingActionButton: FloatingActionButton(onPressed: () => openForm(), child: const Icon(Icons.add)),
    );
  }
}

class _LoanForm extends StatefulWidget {
  final Map? initial;
  final VoidCallback onSaved;
  const _LoanForm({this.initial, required this.onSaved});
  @override
  State<_LoanForm> createState() => _LoanFormState();
}

class _LoanFormState extends State<_LoanForm> {
  late final TextEditingController nameCtrl, lenderCtrl, principalCtrl, outstandingCtrl;
  late final TextEditingController emiCtrl, emiDateCtrl, rateCtrl, tenureCtrl;
  late final TextEditingController startCtrl, endCtrl, notesCtrl;
  String loanType = 'Home';
  String status = 'Active';
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    nameCtrl = TextEditingController(text: '${i?['loanName'] ?? ''}');
    lenderCtrl = TextEditingController(text: '${i?['lender'] ?? ''}');
    principalCtrl = TextEditingController(text: i != null ? '${i['principalAmount'] ?? ''}' : '');
    outstandingCtrl = TextEditingController(text: i != null ? '${i['outstandingAmount'] ?? ''}' : '');
    emiCtrl = TextEditingController(text: i != null ? '${i['emiAmount'] ?? ''}' : '');
    emiDateCtrl = TextEditingController(text: '${i?['emiDate'] ?? 1}');
    rateCtrl = TextEditingController(text: i != null ? '${i['interestRate'] ?? ''}' : '');
    tenureCtrl = TextEditingController(text: i != null ? '${i['tenureMonths'] ?? ''}' : '');
    startCtrl = TextEditingController(text: (('${i?['startDate'] ?? ''}').length >= 10) ? ('${i?['startDate']}').substring(0, 10) : '');
    endCtrl = TextEditingController(text: (('${i?['endDate'] ?? ''}').length >= 10) ? ('${i?['endDate']}').substring(0, 10) : '');
    notesCtrl = TextEditingController(text: '${i?['notes'] ?? ''}');
    if (i?['loanType'] != null && _loanTypes.contains(i!['loanType'])) loanType = i['loanType'];
    if (i?['status'] != null && _loanStatuses.contains(i!['status'])) status = i['status'];
  }

  Future<void> save() async {
    if (nameCtrl.text.trim().isEmpty || (double.tryParse(principalCtrl.text) ?? 0) <= 0) {
      setState(() => error = 'Loan name and principal are required.');
      return;
    }
    setState(() { busy = true; error = null; });
    final payload = {
      'loanName': nameCtrl.text.trim(),
      'loanType': loanType,
      'lender': lenderCtrl.text.trim(),
      'principalAmount': double.tryParse(principalCtrl.text) ?? 0,
      'outstandingAmount': double.tryParse(outstandingCtrl.text) ?? double.tryParse(principalCtrl.text) ?? 0,
      'emiAmount': double.tryParse(emiCtrl.text) ?? 0,
      'emiDate': int.tryParse(emiDateCtrl.text) ?? 1,
      'interestRate': double.tryParse(rateCtrl.text) ?? 0,
      'tenureMonths': int.tryParse(tenureCtrl.text) ?? 0,
      if (startCtrl.text.trim().isNotEmpty) 'startDate': startCtrl.text.trim(),
      if (endCtrl.text.trim().isNotEmpty) 'endDate': endCtrl.text.trim(),
      'status': status,
      if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
    };
    try {
      if (widget.initial != null) {
        await ApiClient.dio.put("/loans/${widget.initial!['_id'] ?? widget.initial!['id']}", data: payload);
      } else {
        await ApiClient.dio.post('/loans', data: payload);
      }
      widget.onSaved();
    } catch (e) {
      setState(() => error = 'Could not save loan.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.initial != null ? 'EDIT LOAN' : 'ADD LOAN', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        if (error != null) ...[const SizedBox(height: 8), Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12))],
        BrutalField(label: 'Loan name', controller: nameCtrl, hint: 'e.g. Home Loan'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Lender', controller: lenderCtrl, hint: 'e.g. SBI')),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('LOAN TYPE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            DropdownButton<String>(value: loanType, isExpanded: true,
              items: _loanTypes.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => loanType = v!)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Principal ₹', controller: principalCtrl, hint: '0')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Outstanding ₹', controller: outstandingCtrl, hint: '0')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'EMI ₹', controller: emiCtrl, hint: '0')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'EMI day (1-31)', controller: emiDateCtrl, hint: '1')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Interest %', controller: rateCtrl, hint: '8.5')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'Tenure (months)', controller: tenureCtrl, hint: '240')),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: BrutalField(label: 'Start (YYYY-MM-DD)', controller: startCtrl, hint: '2026-01-01')),
          const SizedBox(width: 8),
          Expanded(child: BrutalField(label: 'End (YYYY-MM-DD)', controller: endCtrl, hint: '2036-01-01')),
        ]),
        const SizedBox(height: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('STATUS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
          DropdownButton<String>(value: status, isExpanded: true,
            items: _loanStatuses.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
            onChanged: (v) => setState(() => status = v!)),
        ]),
        BrutalField(label: 'Notes', controller: notesCtrl, hint: 'Additional details…'),
        const SizedBox(height: 12),
        BrutalButton(label: busy ? 'Saving…' : 'Save', onPressed: busy ? null : save),
        const SizedBox(height: 20),
      ])),
    );
  }
}

/// Detail view for a single loan: GET /loans/:id + GET /loans/:id/schedule
/// (amortization table) + an EMI calculator section (POST /loans/calculate).
class LoanDetailPage extends StatefulWidget {
  final String loanId;
  const LoanDetailPage({super.key, required this.loanId});
  @override
  State<LoanDetailPage> createState() => _LoanDetailPageState();
}

class _LoanDetailPageState extends State<LoanDetailPage> {
  Map? loan;
  List schedule = [];
  List yearly = [];
  num totalPayable = 0;
  num totalInterest = 0;
  bool loading = true;
  String? error;

  // EMI calculator section.
  final calcPrincipalCtrl = TextEditingController();
  final calcRateCtrl = TextEditingController();
  final calcTenureCtrl = TextEditingController();
  Map? calcResult;
  bool calcBusy = false;
  String? calcError;

  @override
  void initState() {
    super.initState();
    loadDetail();
  }

  @override
  void dispose() {
    calcPrincipalCtrl.dispose();
    calcRateCtrl.dispose();
    calcTenureCtrl.dispose();
    super.dispose();
  }

  Future<void> loadDetail() async {
    if (mounted) setState(() { loading = true; error = null; });
    try {
      final detail = await ApiClient.dio.get('/loans/${widget.loanId}');
      Map? schedData;
      try {
        final sched = await ApiClient.dio.get('/loans/${widget.loanId}/schedule');
        schedData = (sched.data is Map) ? Map<String, dynamic>.from(sched.data as Map) : null;
      } catch (_) {
        schedData = null;
      }
      if (!mounted) return;
      setState(() {
        loan = (detail.data is Map) ? Map<String, dynamic>.from(detail.data as Map) : null;
        schedule = (schedData?['schedule'] as List?) ?? [];
        yearly = (schedData?['yearly'] as List?) ?? [];
        totalPayable = (schedData?['totalPayable'] as num?) ?? 0;
        totalInterest = (schedData?['totalInterest'] as num?) ?? 0;
        if (calcPrincipalCtrl.text.isEmpty && loan != null) {
          calcPrincipalCtrl.text = '${loan!['principalAmount'] ?? ''}';
          calcRateCtrl.text = '${loan!['interestRate'] ?? ''}';
          calcTenureCtrl.text = '${loan!['tenureMonths'] ?? ''}';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = 'Could not load loan details.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> calculateEmi() async {
    final p = double.tryParse(calcPrincipalCtrl.text) ?? 0;
    final r = double.tryParse(calcRateCtrl.text) ?? 0;
    final n = int.tryParse(calcTenureCtrl.text) ?? 0;
    if (p <= 0 || n <= 0) {
      setState(() => calcError = 'Principal and tenure are required.');
      return;
    }
    setState(() { calcBusy = true; calcError = null; });
    try {
      final res = await ApiClient.dio.post('/loans/calculate', data: {
        'principal': p,
        'rate': r,
        'tenureMonths': n,
      });
      if (!mounted) return;
      setState(() => calcResult = Map<String, dynamic>.from(res.data as Map));
    } catch (e) {
      if (!mounted) return;
      setState(() => calcError = 'Could not calculate EMI.');
    } finally {
      if (mounted) setState(() => calcBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(loan?['loanName'] != null ? '${loan!['loanName']}' : 'Loan details')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${loan?['loanName'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                    Text('${loan?['lender'] ?? ''} · ${loan?['loanType'] ?? ''} · ${loan?['interestRate'] ?? 0}% p.a.',
                      style: const TextStyle(fontSize: 12)),
                    const SizedBox(height: 8),
                    Text('Outstanding ₹${((loan?['outstandingAmount'] as num?) ?? 0).toStringAsFixed(0)}',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                    Text('Principal ₹${((loan?['principalAmount'] as num?) ?? 0).toStringAsFixed(0)} · EMI ₹${((loan?['emiAmount'] as num?) ?? 0).toStringAsFixed(0)} · ${loan?['status'] ?? ''}',
                      style: const TextStyle(fontSize: 12)),
                    Text('Total payable ₹${totalPayable.toStringAsFixed(0)} · Total interest ₹${totalInterest.toStringAsFixed(0)}',
                      style: const TextStyle(fontSize: 12)),
                  ])),
                  const SizedBox(height: 12),
                  BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('EMI CALCULATOR', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(child: BrutalField(label: 'Principal ₹', controller: calcPrincipalCtrl, hint: '1000000')),
                      const SizedBox(width: 8),
                      Expanded(child: BrutalField(label: 'Rate %', controller: calcRateCtrl, hint: '8.5')),
                      const SizedBox(width: 8),
                      Expanded(child: BrutalField(label: 'Tenure (mo)', controller: calcTenureCtrl, hint: '240')),
                    ]),
                    const SizedBox(height: 8),
                    if (calcError != null) Text(calcError!, style: const TextStyle(color: Colors.red, fontSize: 12)),
                    if (calcResult != null) ...[
                      Text('EMI ₹${((calcResult!['emi'] as num?) ?? 0).toStringAsFixed(0)}',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                      Text('Total ₹${((calcResult!['totalPayable'] as num?) ?? 0).toStringAsFixed(0)} · Interest ₹${((calcResult!['totalInterest'] as num?) ?? 0).toStringAsFixed(0)}',
                        style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 8),
                    ],
                    BrutalButton(label: calcBusy ? 'Calculating…' : 'Calculate EMI', onPressed: calcBusy ? null : calculateEmi),
                  ])),
                  const SizedBox(height: 12),
                  const Text('AMORTIZATION SCHEDULE', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                  const SizedBox(height: 8),
                  if (schedule.isEmpty) const BrutalCard(child: Text('No schedule rows.'))
                  else BrutalCard(
                    padding: const EdgeInsets.all(8),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        columns: const [
                          DataColumn(label: Text('#')),
                          DataColumn(label: Text('Date')),
                          DataColumn(label: Text('EMI')),
                          DataColumn(label: Text('Principal')),
                          DataColumn(label: Text('Interest')),
                          DataColumn(label: Text('Closing')),
                        ],
                        rows: schedule.map((raw) {
                          final r = Map<String, dynamic>.from(raw as Map);
                          return DataRow(cells: [
                            DataCell(Text('${r['month'] ?? ''}')),
                            DataCell(Text('${(('${r['date'] ?? ''}').length >= 10) ? ('${r['date']}').substring(0, 10) : r['date'] ?? ''}')),
                            DataCell(Text('₹${((r['emi'] as num?) ?? 0).toStringAsFixed(0)}')),
                            DataCell(Text('₹${((r['principal'] as num?) ?? 0).toStringAsFixed(0)}')),
                            DataCell(Text('₹${((r['interest'] as num?) ?? 0).toStringAsFixed(0)}')),
                            DataCell(Text('₹${((r['closing'] as num?) ?? 0).toStringAsFixed(0)}')),
                          ]);
                        }).toList(),
                      ),
                    ),
                  ),
                ]),
    );
  }
}
