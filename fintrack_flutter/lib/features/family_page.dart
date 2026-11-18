import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';

/// Members screen: family identity, invite code, member list and join
/// requests. Family creation/joining moved to Profile, matching the website.
class FamilyPage extends StatefulWidget {
  const FamilyPage({super.key});
  @override
  State<FamilyPage> createState() => _FamilyPageState();
}

class _FamilyPageState extends State<FamilyPage> {
  Map? family;
  List members = [];
  List requests = [];
  bool loading = true;
  String? error;
  bool rotating = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final res = await ApiClient.dio.get('/families/me');
      if (!mounted) return;
      final fam = res.data['family'];
      if (fam == null) {
        setState(() {
          family = null;
          members = [];
          requests = [];
        });
        return;
      }
      final fid = fam['_id'];
      final results = await Future.wait([
        ApiClient.dio.get('/families/$fid/members'),
        ApiClient.dio.get('/families/$fid/requests'),
      ]);
      if (!mounted) return;
      setState(() {
        family = fam;
        members = (results[0].data['members'] as List?) ?? [];
        requests = (results[1].data['requests'] as List?) ?? [];
      });
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Could not load your family. Check your connection and retry.');
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> rotateCode() async {
    final fid = family?['_id'];
    if (fid == null || rotating) return;
    setState(() => rotating = true);
    try {
      final r = await ApiClient.dio.post('/families/$fid/rotate-code');
      if (mounted) setState(() => family = r.data['family'] ?? family);
      _snack('Invite code rotated');
    } catch (_) {
      _snack('Could not rotate the code. Check your connection.');
    } finally {
      if (mounted) setState(() => rotating = false);
    }
  }

  Future<void> decide(String requestId, String action) async {
    final fid = family?['_id'];
    if (fid == null) return;
    try {
      await ApiClient.dio.patch('/families/$fid/requests/$requestId', data: {'action': action});
      await load();
      _snack(action == 'accept' ? 'Member accepted' : 'Request rejected');
    } catch (_) {
      _snack('Could not $action the request. Check your connection.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const BrutalLoading(label: 'Loading members…');
    if (error != null) return BrutalError(message: error!, onRetry: load);

    if (family == null) {
      return RefreshIndicator(
        onRefresh: load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: const [
          BrutalEmpty(
            icon: Icons.group_add,
            message:
                'You are not in a family yet. Create one or join with an invite code from Profile → Set up your family.',
          ),
        ]),
      );
    }

    final code = family!['inviteCode'] ?? '—';
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
        BrutalCard(
          color: FinStackColors.brandYellow,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(
                  '${family!['name'] ?? 'Family'}',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                tooltip: 'Rotate invite code',
                onPressed: rotating ? null : rotateCode,
                icon: rotating
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
            ]),
            const SizedBox(height: 2),
            const Text('INVITE CODE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
            SelectableText(
              '$code',
              style: const TextStyle(
                  fontFamily: 'monospace', fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 3),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        BrutalCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('MEMBERS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            if (members.isEmpty)
              const Text('No members found.', style: TextStyle(fontSize: 12))
            else
              ...members.map((m) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      Container(
                        width: 28,
                        height: 28,
                        color: FinStackColors.surfaceContainer,
                        alignment: Alignment.center,
                        child: Text(
                          '${m['name'] ?? m['email'] ?? '?'}'
                              .trim()
                              .split(RegExp(r'\s+'))
                              .where((p) => p.isNotEmpty)
                              .map((p) => p[0])
                              .take(2)
                              .join()
                              .toUpperCase(),
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('${m['name'] ?? m['email'] ?? ''}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis),
                      ),
                      Text('${m['role'] ?? ''}'.toUpperCase(),
                          style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800)),
                    ]),
                  )),
          ]),
        ),
        if (requests.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text('JOIN REQUESTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ...requests.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: BrutalCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      '${r['userId']?['name'] ?? r['userId']?['email'] ?? 'Member'}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      BrutalButton(label: 'Accept', onPressed: () => decide('${r['_id']}', 'accept')),
                      BrutalButton(label: 'Reject', onPressed: () => decide('${r['_id']}', 'reject')),
                    ]),
                  ]),
                ),
              )),
        ],
      ]),
    );
  }
}
