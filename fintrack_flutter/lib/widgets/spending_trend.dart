import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/spending_statistics.dart';
import '../theme/finstack_theme.dart';
import 'brutal.dart';

const _monoFallback = <String>[FinStackType.body];

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
          border: Border.all(color: FinStackColors.onSurface, width: 1.5),
        ),
      ),
      const SizedBox(width: 6),
      Flexible(
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: FinStackColors.onSurfaceVariant,
          ),
        ),
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
        (_selected ?? buckets.lastIndexWhere((bucket) => bucket.paise > 0))
            .clamp(0, math.max(0, buckets.length - 1))
            .toInt();
    return BrutalCard(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const BrutalSectionTitle(
            title: 'Spending',
            accent: FinStackColors.brandYellow,
          ),
          const SizedBox(height: 6),
          Text(
            spendingInr(view.currentPaise),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: FinStackType.mono,
              fontFamilyFallback: _monoFallback,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.2,
              height: 1.1,
            ),
          ),
          Text(
            '${view.count} ${view.count == 1 ? 'expense' : 'expenses'}',
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
              color: FinStackColors.onSurfaceVariant,
            ),
          ),
          if (view.count > 0) ...[
            const SizedBox(height: 14),
            _chart(context, buckets, selected),
            const SizedBox(height: 10),
            _selection(buckets, selected),
          ],
          if (widget.previousRange case final DateTimeRange previousRange) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.only(top: 10),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: FinStackColors.onSurface.withValues(alpha: .16),
                    width: 1.5,
                  ),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    view.currentPaise == view.previousPaise
                        ? Icons.remove
                        : view.currentPaise > view.previousPaise
                        ? Icons.north_east
                        : Icons.south_east,
                    size: 17,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          spendingDelta(view.currentPaise, view.previousPaise),
                          style: const TextStyle(
                            fontFamily: FinStackType.mono,
                            fontFamilyFallback: _monoFallback,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${spendingInr(view.previousPaise)} in ${spendingDateRange(previousRange)}',
                          style: const TextStyle(
                            fontFamily: FinStackType.mono,
                            fontFamilyFallback: _monoFallback,
                            fontSize: 10.5,
                            color: FinStackColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
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
    const axisStyle = TextStyle(
      fontFamily: FinStackType.mono,
      fontFamilyFallback: _monoFallback,
      fontSize: 9.5,
      fontWeight: FontWeight.w700,
      color: FinStackColors.onSurfaceVariant,
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExcludeSemantics(
          child: SizedBox(
            width: 40,
            height: 116,
            child: Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (final amount in [max, max ~/ 2, 0])
                    Text(_axisLabel(amount), style: axisStyle),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 7),
        Expanded(
          child: Column(
            children: [
              ExcludeSemantics(
                child: Container(
                  height: 116,
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: FinStackColors.onSurface,
                        width: 2,
                      ),
                    ),
                  ),
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
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(shortDateLabel(buckets.first.start), style: axisStyle),
                  if (buckets.first.start != buckets.last.end)
                    Text(shortDateLabel(buckets.last.end), style: axisStyle),
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
    return Container(
      decoration: BoxDecoration(
        color: FinStackColors.surfaceContainer,
        border: Border.all(color: FinStackColors.onSurface, width: 2),
      ),
      child: Row(
        children: [
          if (buckets.length > 1)
            IconButton(
              tooltip: 'Previous chart point',
              visualDensity: VisualDensity.compact,
              iconSize: 18,
              constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
              padding: EdgeInsets.zero,
              onPressed: selected > 0
                  ? () => setState(() => _selected = selected - 1)
                  : null,
              icon: const Icon(Icons.chevron_left),
            ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 9),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  '${spendingDateRange(DateTimeRange(start: bucket.start, end: bucket.end))} · ${spendingInr(bucket.paise)}',
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: FinStackType.mono,
                    fontFamilyFallback: _monoFallback,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ),
          if (buckets.length > 1)
            IconButton(
              tooltip: 'Next chart point',
              visualDensity: VisualDensity.compact,
              iconSize: 18,
              constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
              padding: EdgeInsets.zero,
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

String _axisLabel(int paise) =>
    paise > 0 && paise < 1000 ? spendingInr(paise) : compactInr(paise / 100);

int _axisCeiling(int value) {
  if (value <= 0) return 1;
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
    final grid = Paint()
      ..color = FinStackColors.onSurface.withValues(alpha: .12)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(0, size.height / 2),
      Offset(size.width, size.height / 2),
      grid,
    );

    final step = size.width / buckets.length;
    final barWidth = math.max(1.5, math.min(30.0, step - 2.5));
    const topPadding = 4.0;
    final usable = math.max(0.0, size.height - topPadding);
    final column = Paint()
      ..color = FinStackColors.onSurface.withValues(alpha: .08);
    final fill = Paint()..color = FinStackColors.accentPurple;
    final activeFill = Paint()..color = FinStackColors.onSurface;
    final cap = Paint()
      ..color = FinStackColors.onSurface
      ..strokeWidth = 1.5;
    for (var i = 0; i < buckets.length; i++) {
      final left = step * i;
      final active = i == selected;
      if (active) {
        canvas.drawRect(Rect.fromLTWH(left, 0, step, size.height), column);
      }
      final value = buckets[i].paise;
      if (value <= 0) continue;
      final height = math.max(2.0, value / max * usable * reveal);
      final bar = Rect.fromLTWH(
        left + (step - barWidth) / 2,
        size.height - height,
        barWidth,
        height,
      );
      canvas.drawRect(bar, active ? activeFill : fill);
      canvas.drawLine(
        Offset(bar.left, bar.top),
        Offset(bar.right, bar.top),
        cap,
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
