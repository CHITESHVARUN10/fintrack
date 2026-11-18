import 'package:flutter/material.dart';
import '../theme/finstack_theme.dart';
import 'brutal.dart';

/// Shared, brutalist loading skeleton. Never leaves a screen blank while a
/// request is in flight, and never traps the user without a retry on failure.
class BrutalLoading extends StatelessWidget {
  final String label;
  final int cards;
  const BrutalLoading({super.key, this.label = 'Loading…', this.cards = 3});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(children: [
          Container(
            width: 8,
            height: 18,
            color: FinStackColors.brandYellow,
          ),
          const SizedBox(width: 8),
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(width: 10),
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: FinStackColors.onSurface,
            ),
          ),
        ]),
        const SizedBox(height: 12),
        for (var i = 0; i < cards; i++)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(16),
            decoration: brutal(color: Colors.white, border: 3, shadow: 4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 120, height: 10, color: FinStackColors.brandYellow),
              const SizedBox(height: 10),
              Container(width: double.infinity, height: 8, color: FinStackColors.surfaceHigh),
              const SizedBox(height: 6),
              Container(width: 220, height: 8, color: FinStackColors.surfaceContainer),
              const SizedBox(height: 10),
              Container(width: 90, height: 8, color: FinStackColors.surfaceHigh),
            ]),
          ),
      ],
    );
  }
}

class BrutalError extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const BrutalError({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        BrutalCard(
          color: FinStackColors.errorContainer,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const BrutalTag(
              label: 'Something broke',
              color: FinStackColors.onErrorContainer,
              textColor: Colors.white,
            ),
            const SizedBox(height: 10),
            Text(
              message,
              style: const TextStyle(
                color: FinStackColors.onErrorContainer,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ]),
        ),
        if (onRetry != null) ...[
          const SizedBox(height: 10),
          BrutalButton(label: 'Retry', icon: Icons.refresh, onPressed: onRetry),
        ],
      ],
    );
  }
}

class BrutalEmpty extends StatelessWidget {
  final String message;
  final IconData icon;
  final Widget? action;
  const BrutalEmpty({
    super.key,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return BrutalCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: FinStackColors.brandYellow,
              border: Border.all(color: FinStackColors.onSurface, width: 2),
            ),
            child: Icon(icon, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                message,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
            ),
          ),
        ]),
        if (action != null) ...[const SizedBox(height: 12), action!],
      ]),
    );
  }
}
