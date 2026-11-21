import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import '../widgets/confirm_action.dart';
import '../widgets/brutal.dart';
import '../widgets/workspace.dart';
import '../widgets/states.dart';

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
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final res = await ApiClient.dio.get('/notifications');
      final data = res.data;
      final list = data is List
          ? data
          : (data is Map
                ? (data['items'] as List? ??
                      data['notifications'] as List? ??
                      [])
                : []);
      if (mounted) setState(() => items = list);
    } catch (e) {
      if (mounted) setState(() => error = 'Could not load notifications.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  int get unreadCount =>
      items.where((n) => (n['isRead'] ?? false) != true).length;

  Future<void> markRead(Map item) async {
    if ((item['isRead'] ?? false) == true) return;
    try {
      await ApiClient.dio.put(
        "/notifications/${item['_id'] ?? item['id']}/read",
      );
      if (!mounted) return;
      setState(() {
        final i = items.indexWhere(
          (n) => (n['_id'] ?? n['id']) == (item['_id'] ?? item['id']),
        );
        if (i != -1) items[i] = {...items[i], 'isRead': true};
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not mark as read.')),
        );
      }
    }
  }

  Future<void> markAllRead() async {
    try {
      await ApiClient.dio.put('/notifications/read-all');
      if (!mounted) return;
      setState(
        () =>
            items = items.map((n) => {...(n as Map), 'isRead': true}).toList(),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not mark all as read.')),
        );
      }
    }
  }

  Future<void> remove(Map item) async {
    final ok = await confirmAction(
      context,
      title: 'Delete notification?',
      message: 'Delete this notification?',
      action: 'Delete',
    );
    if (!ok || !mounted) return;
    try {
      await ApiClient.dio.delete("/notifications/${item['_id'] ?? item['id']}");
      if (mounted) await load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not delete notification.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const BrutalLoading(label: 'Loading notifications');
    if (error != null) return BrutalError(message: error!, onRetry: load);
    final unread = unreadCount;
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 14, 19, 24),
        children: [
          Row(
            spacing: 10,
            children: [
              Expanded(
                child: WorkspaceIntro(
                  'Notifications',
                  unread == 0
                      ? 'You’re all caught up.'
                      : '$unread unread alert${unread == 1 ? '' : 's'}.',
                ),
              ),
              BrutalButton(
                label: 'All read',
                onPressed: unread == 0 ? null : markAllRead,
              ),
            ],
          ),
          const SizedBox(height: 13),
          if (items.isEmpty)
            const BrutalEmpty(
              icon: Icons.notifications_none,
              message: 'New alerts will appear here.',
            )
          else
            for (final item in items.whereType<Map>())
              Padding(
                padding: const EdgeInsets.only(bottom: 11),
                child: _notificationCard(item),
              ),
        ],
      ),
    );
  }

  Widget _notificationCard(Map item) {
    final unread = item['isRead'] != true;
    final rawDate = item['scheduledAt'] ?? item['createdAt'];
    final date = DateTime.tryParse('$rawDate')?.toLocal();
    return BrutalCard(
      color: unread ? Colors.white : FinStackColors.surfaceContainer,
      child: Row(
        spacing: 7,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: unread ? () => markRead(item) : null,
                child: Column(
                  spacing: 6,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        BrutalTag(
                          label: '${item['type'] ?? 'Info'}',
                          color: FinStackColors.surfaceContainer,
                        ),
                        if (unread) const BrutalTag(label: 'Unread'),
                      ],
                    ),
                    Text(
                      '${item['message'] ?? ''}',
                      style: TextStyle(
                        fontWeight: unread ? FontWeight.w800 : FontWeight.w600,
                      ),
                    ),
                    if (date != null)
                      Text(dateLabel(date), style: FinStackType.caption),
                  ],
                ),
              ),
            ),
          ),
          BrutalIconButton(
            icon: Icons.delete_outline,
            tooltip: 'Delete notification',
            color: FinStackColors.errorContainer,
            size: 32,
            onPressed: () => remove(item),
          ),
        ],
      ),
    );
  }
}
