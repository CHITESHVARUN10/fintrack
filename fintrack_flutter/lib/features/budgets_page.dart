import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

class BudgetsPage extends StatefulWidget {
  const BudgetsPage({super.key});
  @override
  State<BudgetsPage> createState() => _BudgetsPageState();
}

class _BudgetsPageState extends State<BudgetsPage> {
  List items = [];
  final amountCtrl = TextEditingController();
  String scope='FAMILY';
  String period='MONTHLY';
  final categoryCtrl = TextEditingController();

  @override
  void initState(){ super.initState(); load(); }

  Future<void> load() async {
    try { final r = await ApiClient.dio.get('/budgets'); setState(()=> items = r.data['items'] ?? r.data ?? []); } catch(_){}
  }

  Future<void> save() async {
    final paise = (double.tryParse(amountCtrl.text)??0)*100;
    if(paise<=0) return;
    await ApiClient.dio.post('/budgets', data: {'scope': scope, 'category': categoryCtrl.text.isEmpty? null: categoryCtrl.text, 'period': period, 'amountPaise': paise.round()});
    amountCtrl.clear(); categoryCtrl.clear(); await load();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('NEW BUDGET', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        DropdownButtonFormField<String>(value: scope, decoration: const InputDecoration(labelText: 'Scope'), items: const ['FAMILY','CATEGORY','MEMBER'].map((e)=> DropdownMenuItem(value:e, child: Text(e))).toList(), onChanged: (v)=> setState(()=> scope=v!)),
        TextField(controller: categoryCtrl, decoration: const InputDecoration(hintText: 'Category (for CATEGORY scope)')),
        TextField(controller: amountCtrl, decoration: const InputDecoration(hintText: 'Amount ₹'), keyboardType: TextInputType.number),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: BrutalButton(label: 'Save Budget', onPressed: save)),
      ])),
      const SizedBox(height: 12),
      ...items.map((b)=> Container(margin: const EdgeInsets.only(bottom: 8), decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFF1E1C10), width: 2)), padding: const EdgeInsets.all(12), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('${b['scope']} ${b['category'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)), Text('₹${((b['amountPaise']??0)/100).toStringAsFixed(0)}  •  spent ₹${((b['spentPaise']??0)/100).toStringAsFixed(0)}', style: const TextStyle(fontSize: 11))]))),
      if(items.isEmpty) const BrutalCard(child: Text('No budgets yet.')),
    ]);
  }
}
