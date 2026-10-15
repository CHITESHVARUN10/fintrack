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

  void _snack(String msg) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  Future<void> load() async {
    try {
      final res = await ApiClient.dio.get('/families/me');
      if (mounted) setState(() => family = res.data['family']);
      if (family != null) {
        final r = await ApiClient.dio.get('/families/${family!['_id']}/requests');
        if (mounted) setState(() => requests = r.data['requests'] ?? []);
      }
    } catch (_) {}
  }

  Future<void> create() async {
    if(nameCtrl.text.trim().isEmpty) return;
    try {
      await ApiClient.dio.post('/families', data: {'name': nameCtrl.text.trim()});
      nameCtrl.clear(); await load();
      _snack('Family created');
    } catch (e) {
      _snack('Could not create family. Check your connection.');
    }
  }

  Future<void> join() async {
    if(codeCtrl.text.trim().isEmpty) return;
    try {
      await ApiClient.dio.post('/families/join', data: {'inviteCode': codeCtrl.text.trim().toUpperCase()});
      codeCtrl.clear(); await load();
      _snack('Join request sent — awaiting admin approval');
    } catch (e) {
      _snack('Could not join. Check the invite code and your connection.');
    }
  }

  Future<void> decide(String requestId, String action) async {
    final fid = family!['_id'];
    try {
      await ApiClient.dio.patch('/families/$fid/requests/$requestId', data: {'action': action});
      await load();
    } catch (e) {
      _snack('Could not $action request. Check your connection.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (family != null)
        BrutalCard(color: const Color(0xFFFFE500), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Flexible(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(family!['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis), Text('Code: ${family!['inviteCode'] ?? '—'}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 2))])),
          IconButton(onPressed: () async {
            try {
              final r = await ApiClient.dio.post('/families/${family!['_id']}/rotate-code');
              if (mounted) setState(()=> family = r.data['family']);
            } catch (e) {
              _snack('Could not rotate code. Check your connection.');
            }
          }, icon: const Icon(Icons.refresh)),
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
          Flexible(child: Text(r['userId']?['name'] ?? r['userId']?['email'] ?? '', overflow: TextOverflow.ellipsis)),
          Row(children: [
            BrutalButton(label: 'Accept', onPressed: () => decide('${r['_id']}', 'accept')),
            const SizedBox(width: 8),
            BrutalButton(label: 'Reject', onPressed: () => decide('${r['_id']}', 'reject')),
          ])
        ]))),
      ]
    ]);
  }
}
