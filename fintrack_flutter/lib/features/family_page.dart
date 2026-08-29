import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

class FamilyPage extends StatefulWidget {
  const FamilyPage({super.key});
  @override
  State<FamilyPage> createState() => _FamilyPageState();
}

class _FamilyPageState extends State<FamilyPage> {
  Map? family;
  List requests = [];
  final nameCtrl = TextEditingController();
  final codeCtrl = TextEditingController();

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try {
      final res = await ApiClient.dio.get('/families/me');
      setState(() => family = res.data['family']);
      if (family != null) {
        final r = await ApiClient.dio.get('/families/${family!['_id']}/requests');
        setState(()=> requests = r.data['requests'] ?? []);
      }
    } catch (_) {}
  }

  Future<void> create() async {
    if(nameCtrl.text.trim().isEmpty) return;
    await ApiClient.dio.post('/families', data: {'name': nameCtrl.text.trim()});
    nameCtrl.clear(); await load();
  }

  Future<void> join() async {
    if(codeCtrl.text.trim().isEmpty) return;
    await ApiClient.dio.post('/families/join', data: {'inviteCode': codeCtrl.text.trim().toUpperCase()});
    codeCtrl.clear(); await load();
    if(mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Join request sent — awaiting admin approval')));
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (family != null)
        BrutalCard(color: const Color(0xFFFFE500), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(family!['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)), Text('Code: ${family!['inviteCode'] ?? '—'}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 2))]),
          IconButton(onPressed: () async { final r = await ApiClient.dio.post('/families/${family!['_id']}/rotate-code'); setState(()=> family = r.data['family']); }, icon: const Icon(Icons.refresh)),
        ]))
      else
        const BrutalCard(child: Text('No family yet — create or join below.')),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('CREATE FAMILY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        TextField(controller: nameCtrl, decoration: const InputDecoration(hintText: 'Varun Family')),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: BrutalButton(label: 'Create', onPressed: create)),
      ])),
      const SizedBox(height: 12),
      BrutalCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('JOIN FAMILY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        TextField(controller: codeCtrl, decoration: const InputDecoration(hintText: 'VF7K92')),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: BrutalButton(label: 'Join', onPressed: join)),
      ])),
      if (requests.isNotEmpty) ...[
        const SizedBox(height: 12),
        const Text('JOIN REQUESTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        ...requests.map((r) => BrutalCard(child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(r['userId']?['name'] ?? r['userId']?['email'] ?? ''),
          Row(children: [
            BrutalButton(label: 'Accept', onPressed: () async { await ApiClient.dio.patch('/families/${family!['_id']}/requests/${r['_id']}', data: {'action':'accept'}); await load(); }),
            const SizedBox(width: 8),
            BrutalButton(label: 'Reject', onPressed: () async { await ApiClient.dio.patch('/families/${family!['_id']}/requests/${r['_id']}', data: {'action':'reject'}); await load(); }),
          ])
        ]))),
      ]
    ]);
  }
}
