import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../widgets/brutal.dart';

String _date10(dynamic v) {
  final s = '$v';
  return s.length >= 10 ? s.substring(0, 10) : s;
}

/// Mirrors website Notifications.tsx + backend notifications routes:
/// GET /notifications (plain list), PUT /notifications/read-all,
/// PUT /notifications/:id/read, DELETE /notifications/:id.
class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});
  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  List items = [];
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
      final res = await ApiClient.dio.get('/notifications');
      final data = res.data;
      final list = data is List ? data : (data is Map ? (data['items'] as List? ?? data['notifications'] as List? ?? []) : []);
      setState(() => items = list);
    } catch (e) {
      setState(() => error = 'Could not load notifications.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  int get unreadCount => items.where((n) => (n['isRead'] ?? false) != true).length;

  Future<void> markRead(Map item) async {
    if ((item['isRead'] ?? false) == true) return;
    try {
      await ApiClient.dio.put("/notifications/${item['_id'] ?? item['id']}/read");
      if (!mounted) return;
      setState(() {
        final i = items.indexWhere((n) => (n['_id'] ?? n['id']) == (item['_id'] ?? item['id']));
        if (i != -1) items[i] = {...items[i], 'isRead': true};
      });
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not mark as read.')));
    }
  }

  Future<void> markAllRead() async {
    try {
      await ApiClient.dio.put('/notifications/read-all');
      if (!mounted) return;
      setState(() => items = items.map((n) => {...(n as Map), 'isRead': true}).toList());
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not mark all as read.')));
    }
  }

  Future<void> remove(Map item) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Delete?'),
      content: const Text('Delete this notification?'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete'))],
    ));
    if (ok != true) return;
    try {
      await ApiClient.dio.delete("/notifications/${item['_id'] ?? item['id']}");
      await load();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete notification.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: BrutalCard(child: Text(error!)))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Expanded(child: Text('NOTIFICATIONS\nYou have $unreadCount unread alerts.', style: const TextStyle(fontSize: 12))),
                    BrutalButton(label: 'All read', onPressed: unreadCount == 0 ? null : markAllRead),
                  ]),
                  const SizedBox(height: 12),
                  if (items.isEmpty) const BrutalCard(child: Text('No notifications.'))
                  else ...items.map((n) {
                    final unread = (n['isRead'] ?? false) != true;
                    final time = n['scheduledAt'] ?? n['createdAt'] ?? '';
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: unread ? BoxDecoration(border: const Border(left: BorderSide(width: 6, color: Color(0xFFFFE500)))) : null,
                      child: BrutalCard(
                        color: unread ? Colors.white : const Color(0xFFF5F5F5),
                        child: InkWell(
                          onTap: () => markRead(n),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(border: Border.all(width: 2)),
                                child: Text('${n['type'] ?? 'info'}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                              const SizedBox(height: 4),
                              Text('${n['message'] ?? ''}', style: TextStyle(fontSize: 14, fontWeight: unread ? FontWeight.w800 : FontWeight.w400)),
                              const SizedBox(height: 2),
                              Text(_date10(time), style: const TextStyle(fontSize: 11)),
                            ])),
                            if (unread) Container(margin: const EdgeInsets.only(top: 6, left: 8), width: 10, height: 10, color: Colors.black),
                            IconButton(icon: const Icon(Icons.delete, size: 18), onPressed: () => remove(n)),
                          ]),
                        ),
                      ),
                    );
                  }),
                ]),
    );
  }
}
