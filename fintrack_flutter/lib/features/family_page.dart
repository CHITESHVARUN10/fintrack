import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/api_client.dart';
import '../theme/finstack_theme.dart';
import '../widgets/brutal.dart';
import '../widgets/states.dart';

/// Members screen: family identity, invite code, member list and join
/// requests. Family creation/joining moved to Profile, matching the website.
class FamilyPage extends StatefulWidget {
  const FamilyPage({
    super.key,
    this.showHeader = false,
    this.refresh = 0,
    this.userId,
    this.onSetup,
  });

  final bool showHeader;
  final int refresh;
  final String? userId;
  final VoidCallback? onSetup;
  @override
  State<FamilyPage> createState() => _FamilyPageState();
}

class _FamilyPageState extends State<FamilyPage> {
  Map? family;
  List members = [];
  bool admin = false;
  List requests = [];
  bool loading = true;
  String? error;
  bool rotating = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(covariant FamilyPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.refresh != oldWidget.refresh) load();
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
          admin = false;
          members = [];
          requests = [];
        });
        return;
      }
      final fid = fam['_id'];
      final canManage =
          '${res.data['membership']?['role'] ?? ''}'.toUpperCase() == 'ADMIN' ||
          (widget.userId != null && '${fam['adminId']}' == widget.userId);
      final memberResponse = await ApiClient.dio.get('/families/$fid/members');
      final requestResponse = canManage
          ? await ApiClient.dio.get('/families/$fid/requests')
          : null;
      if (!mounted) return;
      setState(() {
        family = fam;
        admin = canManage;
        members = (memberResponse.data['members'] as List?) ?? [];
        requests = (requestResponse?.data['requests'] as List?) ?? [];
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Could not load your family. Check your connection and retry.',
        );
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
      await ApiClient.dio.patch(
        '/families/$fid/requests/$requestId',
        data: {'action': action},
      );
      await load();
      _snack(action == 'accept' ? 'Member accepted' : 'Request rejected');
    } catch (_) {
      _snack('Could not $action the request. Check your connection.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final body = loading
        ? const BrutalLoading(label: 'Loading family…')
        : error != null
        ? BrutalError(message: error!, onRetry: load)
        : RefreshIndicator(
            onRefresh: load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
              children: family == null ? [_emptyFamily()] : _household(),
            ),
          );
    if (!widget.showHeader) return body;
    return Scaffold(
      appBar: AppBar(
        title: const FinStackTitle('Family'),
        actions: [
          if (family != null)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: BrutalTag(
                label: admin ? 'Admin' : 'Member',
                color: FinStackColors.accentCyan,
              ),
            ),
        ],
      ),
      body: BrutalGrid(child: body),
    );
  }

  Widget _emptyFamily() => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: brutal(
                color: FinStackColors.brandYellow,
                border: 2,
                shadow: 2,
              ),
              child: const Icon(Icons.group_add_outlined),
            ),
            const Expanded(
              child: Text('Create a family or join one with an invite code.'),
            ),
          ],
        ),
        if (widget.onSetup != null)
          BrutalButton(
            label: 'Go to family setup',
            icon: Icons.arrow_forward,
            block: true,
            onPressed: widget.onSetup,
          ),
      ],
    ),
  );

  List<Widget> _household() {
    final name = '${family?['name'] ?? 'Family'}';
    final code = '${family?['inviteCode'] ?? ''}';
    return [
      BrutalCard(
        color: FinStackColors.brandYellow,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 10,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: Theme.of(context).textTheme.titleLarge),
                  if (code.isNotEmpty) ...[
                    const SizedBox(height: 9),
                    const Text('INVITE CODE', style: FinStackType.caption),
                    SelectableText(
                      code,
                      style: FinStackType.amount.copyWith(
                        fontSize: 27,
                        letterSpacing: 3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (admin)
              BrutalIconButton(
                icon: Icons.sync,
                tooltip: 'Rotate invite code',
                color: Colors.white,
                size: 34,
                onPressed: rotating ? null : rotateCode,
              )
            else if (code.isNotEmpty)
              BrutalIconButton(
                icon: Icons.copy_outlined,
                tooltip: 'Copy invite code',
                color: Colors.white,
                size: 34,
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: code));
                  _snack('Invite code copied');
                },
              ),
          ],
        ),
      ),
      const SizedBox(height: 13),
      BrutalCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('MEMBERS', style: FinStackType.caption),
            const SizedBox(height: 8),
            if (members.isEmpty) const Text('No members found.'),
            for (final (index, member) in members.whereType<Map>().indexed) ...[
              if (index != 0)
                const Divider(
                  height: 1,
                  thickness: 1,
                  color: FinStackColors.outlineVariant,
                ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: _memberRow(member),
              ),
            ],
          ],
        ),
      ),
      if (admin && requests.isNotEmpty) ...[
        const SizedBox(height: 13),
        const Text('JOIN REQUESTS', style: FinStackType.caption),
        const SizedBox(height: 8),
        for (final item in requests.whereType<Map>())
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _joinRequest(item),
          ),
      ],
    ];
  }

  Widget _memberRow(Map member) {
    final name = '${member['name'] ?? member['email'] ?? 'Member'}';
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .map((word) => word.characters.first)
        .take(2)
        .join()
        .toUpperCase();
    return Row(
      spacing: 10,
      children: [
        Container(
          width: 35,
          height: 35,
          alignment: Alignment.center,
          decoration: brutal(
            color: FinStackColors.surfaceContainer,
            border: 2,
            shadow: 0,
          ),
          child: Text(initials, style: FinStackType.caption),
        ),
        Expanded(
          child: Text(
            name,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        Text(
          '${member['membershipRole'] ?? member['role'] ?? ''}'.toUpperCase(),
          style: FinStackType.caption,
        ),
      ],
    );
  }

  Widget _joinRequest(Map item) => BrutalCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 10,
      children: [
        Text(
          '${item['userId']?['name'] ?? item['userId']?['email'] ?? 'Member'}',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        Row(
          spacing: 10,
          children: [
            Expanded(
              child: BrutalButton(
                label: 'Accept',
                block: true,
                onPressed: () => decide('${item['_id']}', 'accept'),
              ),
            ),
            Expanded(
              child: BrutalButton(
                label: 'Reject',
                block: true,
                onPressed: () => decide('${item['_id']}', 'reject'),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}
