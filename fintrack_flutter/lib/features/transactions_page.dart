import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';

class TransactionsPage extends StatefulWidget {
  const TransactionsPage({super.key});
  @override
  State<TransactionsPage> createState() => _TransactionsPageState();
}

class _TransactionsPageState extends State<TransactionsPage> {
  bool familyView = false;
  List items = [];
  Map summary = {};
  bool loading = true;
  final amountCtrl = TextEditingController();
  String type = 'EXPENSE';
  String mode = 'UPI';
  String category = 'Other';
  final recipientCtrl = TextEditingController();
  final vendorCtrl = TextEditingController();
  DateTime? fromDate; DateTime? toDate; String modeFilter='';

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final qp=<String,dynamic>{'familyView': familyView};
      if(fromDate!=null) qp['from']=fromDate!.toIso8601String().slice(0,10);
      if(toDate!=null) qp['to']=toDate!.toIso8601String().slice(0,10);
      if(modeFilter.isNotEmpty) qp['mode']=modeFilter;
      if(vendorCtrl.text.trim().isNotEmpty) qp['vendor']=vendorCtrl.text.trim();
      final res = await ApiClient.dio.get('/transactions', queryParameters: qp);
      setState(() { items = res.data['items'] ?? res.data ?? []; summary = res.data['summary'] ?? {}; });
    } catch (e) { /* ignore */ }
    setState(() => loading = false);
  }

  Future<void> add() async {
    final paise = (double.tryParse(amountCtrl.text) ?? 0) * 100;
    if (paise <= 0) return;
    await ApiClient.dio.post('/transactions', data: {'amountPaise': paise.round(), 'type': type, 'mode': mode, 'category': category, 'occurredAt': DateTime.now().toIso8601String(), 'recipient': recipientCtrl.text.isNotEmpty ? {'name': recipientCtrl.text} : null});
    amountCtrl.clear(); recipientCtrl.clear(); await load();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      Row(children: [
        Expanded(child: BrutalButton(label: 'My', onPressed: (){ setState(()=> familyView=false); load(); })),
        const SizedBox(width: 8),
        Expanded(child: BrutalButton(label: 'Family', onPressed: (){ setState(()=> familyView=true); load(); })),
      ]),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('FILTERS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Row(children: [Expanded(child: TextField(controller: vendorCtrl, decoration: const InputDecoration(hintText: 'Vendor'))), const SizedBox(width: 8), Expanded(child: DropdownButtonFormField<String>(value: modeFilter.isEmpty?null:modeFilter, hint: const Text('Mode'), items: const ['UPI','BANK','CASH','CARD','OTHER'].map((e)=> DropdownMenuItem(value:e, child: Text(e))).toList(), onChanged:(v)=> setState(()=> modeFilter=v??'')))]),
        const SizedBox(height: 8),
        Row(children: [Expanded(child: OutlinedButton(onPressed: () async { final d=await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(2030), initialDate: fromDate??DateTime.now()); if(d!=null) setState(()=> fromDate=d); }, child: Text(fromDate==null?'From': fromDate!.toIso8601String().slice(0,10)))), const SizedBox(width: 8), Expanded(child: OutlinedButton(onPressed: () async { final d=await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(2030), initialDate: toDate??DateTime.now()); if(d!=null) setState(()=> toDate=d); }, child: Text(toDate==null?'To': toDate!.toIso8601String().slice(0,10))))]),
        const SizedBox(height: 8),
        Row(children: [Expanded(child: BrutalButton(label: 'Apply', onPressed: load)), const SizedBox(width: 8), Expanded(child: BrutalButton(label: 'Clear', onPressed: (){ vendorCtrl.clear(); setState(()=> {fromDate=null; toDate=null; modeFilter='';}); load(); }))]),
      ])),
      const SizedBox(height: 12),
      if (summary.isNotEmpty)
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Stat(label: 'Actual', value: '₹${((summary['actualExpenditurePaise']??0)/100).toStringAsFixed(0)}'),
          _Stat(label: 'Transfers', value: '₹${((summary['internalTransfersPaise']??0)/100).toStringAsFixed(0)}'),
          _Stat(label: 'Withdrawals', value: '₹${((summary['cashWithdrawalsPaise']??0)/100).toStringAsFixed(0)}'),
          _Stat(label: 'Movement', value: '₹${((summary['totalMovementPaise']??0)/100).toStringAsFixed(0)}'),
        ]),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('ADD TRANSACTION', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Row(children: [Expanded(child: TextField(controller: amountCtrl, decoration: const InputDecoration(hintText: 'Amount ₹'), keyboardType: TextInputType.number)), const SizedBox(width: 8), Expanded(child: DropdownButtonFormField<String>(value: type, decoration: const InputDecoration(), items: const ['EXPENSE','INCOME','INTERNAL_TRANSFER','CASH_WITHDRAWAL','CASH_EXPENSE'].map((e)=> DropdownMenuItem(value: e, child: Text(e, style: TextStyle(fontSize: 11)))).toList(), onChanged: (v)=> setState(()=> type=v!)))  ]),
        const SizedBox(height: 8),
        TextField(controller: recipientCtrl, decoration: const InputDecoration(hintText: 'Recipient (optional)')),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: BrutalButton(label: '+ Add', onPressed: add)),
      ])),
      const SizedBox(height: 12),
      if (loading) const Center(child: CircularProgressIndicator()) else if (items.isEmpty) const BrutalCard(child: Text('No transactions yet.')) else
        ...items.map((t) => Container(margin: const EdgeInsets.only(bottom: 8), decoration: brutal(), padding: const EdgeInsets.all(12), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t['type'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)), Text(t['category'] ?? '', style: const TextStyle(fontSize: 11, color: FinStackColors.onSurfaceVariant))]),
          Text('₹${((t['amountPaise']??0)/100).toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
        ]))),
    ]);
  }
}

class _Stat extends StatelessWidget {
  final String label; final String value;
  const _Stat({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Container(decoration: brutal(border: 2, shadow: 2), padding: const EdgeInsets.all(10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)), const SizedBox(height: 4), Text(value, style: const TextStyle(fontWeight: FontWeight.w700))]));
}
