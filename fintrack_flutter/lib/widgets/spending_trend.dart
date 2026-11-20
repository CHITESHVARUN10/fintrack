import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/spending_statistics.dart';
import '../theme/finstack_theme.dart';
import 'brutal.dart';

String spendingDateRange(DateTimeRange dates) => dates.start == dates.end
    ? dateLabel(dates.start)
    : '${dates.start.year == dates.end.year ? shortDateLabel(dates.start) : dateLabel(dates.start)} – ${dateLabel(dates.end)}';

String spendingInr(int paise) {
  final sign = paise < 0 ? '-' : '';
  final amount = paise.abs();
  final remainder = amount % 100;
  return '$sign${inr(amount ~/ 100)}${remainder == 0 ? '' : '.${remainder.toString().padLeft(2, '0')}'}';
}

String spendingDelta(int current, int previous) {
  final difference = current - previous;
  if (difference == 0) return 'No change';
  if (previous == 0) return '${spendingInr(current)} more · No previous spend';
  final relative = difference.abs() * 100 / previous;
  final percent = relative < 1
      ? (relative < .1 ? '<0.1%' : '${relative.toStringAsFixed(1)}%')
      : '${relative.round()}%';
  return '${spendingInr(difference.abs())} ${difference > 0 ? 'more' : 'less'} ($percent)';
}

class SpendingChartKey extends StatelessWidget {
  const SpendingChartKey({super.key, required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: color,
          border: Border.all(color: FinStackColors.onSurface),
        ),
      ),
      const SizedBox(width: 5),
      Flexible(
        child: Text(label, style: Theme.of(context).textTheme.bodySmall),
      ),
    ],
  );
}

class SpendingTrend extends StatefulWidget {
  const SpendingTrend({
    super.key,
    required this.view,
    required this.previousRange,
  });

  final SpendingView view;
  final DateTimeRange? previousRange;

  @override
  State<SpendingTrend> createState() => _SpendingTrendState();
}

class _SpendingTrendState extends State<SpendingTrend> {
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final view = widget.view;
    final buckets = view.buckets;
    final selected =
        _selected ?? buckets.lastIndexWhere((bucket) => bucket.paise > 0);
    final style = Theme.of(context).textTheme;
    return BrutalCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const BrutalSectionTitle(
            title: 'Spending',
            accent: FinStackColors.brandYellow,
          ),
          const SizedBox(height: 8),
          Text(
            spendingInr(view.currentPaise),
            style: style.headlineLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          Text(
            '${view.count} ${view.count == 1 ? 'expense' : 'expenses'}',
            style: style.bodySmall,
          ),
          if (view.count > 0) ...[
            const SizedBox(height: 16),
            _chart(context, buckets, selected),
            const SizedBox(height: 8),
            _selection(buckets, selected),
          ],
          if (widget.previousRange case final DateTimeRange previousRange) ...[
            const Divider(
              height: 20,
              thickness: 1,
              color: FinStackColors.outlineVariant,
            ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  view.currentPaise == view.previousPaise
                      ? Icons.remove
                      : view.currentPaise > view.previousPaise
                      ? Icons.north_east
                      : Icons.south_east,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        spendingDelta(view.currentPaise, view.previousPaise),
                        style: style.titleMedium,
                      ),
                      Text(
                        '${spendingInr(view.previousPaise)} in ${spendingDateRange(previousRange)}',
                        style: style.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _chart(
    BuildContext context,
    List<SpendingBucket> buckets,
    int selected,
  ) {
    final peak = buckets.fold<int>(
      0,
      (max, bucket) => math.max(max, bucket.paise),
    );
    final max = _axisCeiling(peak);
    final axis = Theme.of(context).textTheme.bodySmall;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExcludeSemantics(
          child: SizedBox(
            height: 118,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final amount in [max, max / 2, 0])
                  Text(
                    amount > 0 && amount < 1000
                        ? spendingInr(amount.round())
                        : compactInr(amount / 100),
                    style: axis,
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 7),
        Expanded(
          child: Column(
            children: [
              ExcludeSemantics(
                child: SizedBox(
                  height: 118,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      void select(Offset point) {
                        final index =
                            (point.dx * buckets.length / constraints.maxWidth)
                                .floor()
                                .clamp(0, buckets.length - 1);
                        if (index != selected) {
                          setState(() => _selected = index);
                        }
                      }

                      return MouseRegion(
                        onHover: (event) => select(event.localPosition),
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (event) => select(event.localPosition),
                          onHorizontalDragStart: (event) =>
                              select(event.localPosition),
                          onHorizontalDragUpdate: (event) =>
                              select(event.localPosition),
                          child: TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: 1),
                            duration: MediaQuery.disableAnimationsOf(context)
                                ? Duration.zero
                                : const Duration(milliseconds: 480),
                            curve: Curves.easeOutCubic,
                            builder: (context, reveal, _) => CustomPaint(
                              painter: _TrendBars(
                                buckets,
                                selected,
                                max,
                                reveal,
                              ),
                              child: const SizedBox.expand(),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(shortDateLabel(buckets.first.start), style: axis),
                  if (buckets.first.start != buckets.last.end)
                    Text(shortDateLabel(buckets.last.end), style: axis),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _selection(List<SpendingBucket> buckets, int selected) {
    final bucket = buckets[selected];
    return DecoratedBox(
      decoration: const BoxDecoration(color: FinStackColors.surfaceContainer),
      child: Row(
        children: [
          if (buckets.length > 1)
            IconButton(
              tooltip: 'Previous chart point',
              onPressed: selected > 0
                  ? () => setState(() => _selected = selected - 1)
                  : null,
              icon: const Icon(Icons.chevron_left),
            ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  '${spendingDateRange(DateTimeRange(start: bucket.start, end: bucket.end))} · ${spendingInr(bucket.paise)}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            ),
          ),
          if (buckets.length > 1)
            IconButton(
              tooltip: 'Next chart point',
              onPressed: selected < buckets.length - 1
                  ? () => setState(() => _selected = selected + 1)
                  : null,
              icon: const Icon(Icons.chevron_right),
            ),
        ],
      ),
    );
  }
}

int _axisCeiling(int value) {
  final magnitude = math.pow(10, (math.log(value) / math.ln10).floor()).toInt();
  for (final step in [2, 4, 6, 8, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

class _TrendBars extends CustomPainter {
  _TrendBars(this.buckets, this.selected, this.max, this.reveal);

  final List<SpendingBucket> buckets;
  final int selected;
  final int max;
  final double reveal;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()..color = FinStackColors.outlineVariant;
    const top = 7.0;
    final bottom = size.height - 7;
    final height = bottom - top;
    for (final y in [top, top + height / 2, bottom]) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    final step = size.width / buckets.length;
    final bar = Paint();
    for (var i = 0; i < buckets.length; i++) {
      final x = step * (i + .5);
      final active = i == selected;
      if (active) {
        bar.color = FinStackColors.surfaceVariant.withValues(alpha: .55);
        canvas.drawRect(
          Rect.fromLTRB(x - step / 2, top, x + step / 2, bottom),
          bar,
        );
      }
      final value = buckets[i].paise;
      if (value == 0) continue;
      bar.color = active
          ? FinStackColors.onSurface
          : FinStackColors.accentPurple;
      canvas.drawRect(
        Rect.fromCenter(
          center: Offset(x, bottom - value / max * height * reveal / 2),
          width: math.min(30, step * .73),
          height: value / max * height * reveal,
        ),
        bar,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _TrendBars oldDelegate) =>
      oldDelegate.buckets != buckets ||
      oldDelegate.selected != selected ||
      oldDelegate.max != max ||
      oldDelegate.reveal != reveal;
}
