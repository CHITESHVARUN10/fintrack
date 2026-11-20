import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../core/format.dart';
import '../theme/finstack_theme.dart';
import 'brutal.dart';

const _colors = [
  FinStackColors.accentPurple,
  FinStackColors.brandYellow,
  FinStackColors.chartTeal,
  FinStackColors.accentPink,
  FinStackColors.accentBlue,
  FinStackColors.accentOrange,
  FinStackColors.accentGreen,
  FinStackColors.onSurfaceVariant,
];

class SpendingBreakdown extends StatefulWidget {
  const SpendingBreakdown({
    super.key,
    required this.title,
    required this.emptyMessage,
    required this.entries,
    required this.accent,
    this.background = Colors.white,
    this.subtitle = 'Share of this month’s spend',
    this.formatAmount = inr,
  });

  final String title;
  final String emptyMessage;
  final List<({String label, double value})> entries;
  final Color accent;
  final Color background;
  final String subtitle;
  final String Function(num) formatAmount;

  @override
  State<SpendingBreakdown> createState() => _SpendingBreakdownState();
}

class _SpendingBreakdownState extends State<SpendingBreakdown>
    with SingleTickerProviderStateMixin {
  int? _selected;
  ({int segment, double angle})? _touchFocus;
  late final AnimationController _motion;
  double _previousAngle = 0;
  double _nextAngle = 0;
  double _previousLift = 0;
  double _nextLift = 0;

  double get _progress => Curves.easeOutCubic.transform(_motion.value);
  double get _angle =>
      _previousAngle + (_nextAngle - _previousAngle) * _progress;
  double get _lift => _previousLift + (_nextLift - _previousLift) * _progress;

  @override
  void initState() {
    super.initState();
    _motion = AnimationController(vsync: this, value: 1);
  }

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  void _track(Offset local, Size size, List<double> shares) {
    final position = local - size.center(Offset.zero);
    if (position.distance < size.width * .28 ||
        position.distance > size.width * .53) {
      _clearPreview();
      return;
    }
    final angle = math.atan2(position.dy, position.dx);
    final fraction = ((angle + math.pi / 2) / _turn) % 1;
    var end = 0.0;
    for (var i = 0; i < shares.length; i++) {
      end += shares[i];
      if (fraction < end) {
        _preview((segment: i, angle: angle));
        return;
      }
    }
  }

  void _clearPreview() => _preview(null);

  void _preview(({int segment, double angle})? focus) {
    if (_touchFocus == focus) return;
    _previousAngle = _touchFocus == null && focus != null
        ? focus.angle
        : _angle;
    _previousLift = _lift;
    final delta = (focus?.angle ?? _previousAngle) - _previousAngle;
    _nextAngle = _previousAngle + (delta + math.pi) % _turn - math.pi;
    _nextLift = focus == null ? 0 : 1;
    setState(() => _touchFocus = focus);
    if (MediaQuery.disableAnimationsOf(context)) {
      _motion.value = 1;
    } else {
      _motion.duration = Duration(milliseconds: focus == null ? 240 : 110);
      _motion.forward(from: 0);
    }
  }

  @override
  void didUpdateWidget(covariant SpendingBreakdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!listEquals(widget.entries, oldWidget.entries)) {
      _touchFocus = null;
      _previousLift = 0;
      _nextLift = 0;
    }
    final index = _selected;
    if (index != null &&
        (index >= widget.entries.length ||
            widget.entries[index].label != oldWidget.entries[index].label)) {
      _selected = null;
    }
  }

  void _select(int? index) {
    setState(() => _selected = _selected == index ? null : index);
  }

  @override
  Widget build(BuildContext context) {
    final entries = widget.entries;
    final total = entries.fold<double>(0, (sum, entry) => sum + entry.value);
    final share = entries.map((entry) => entry.value / total).toList();
    final selected = _touchFocus?.segment ?? _selected;
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return BrutalCard(
      color: widget.background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BrutalSectionTitle(
            title: widget.title,
            subtitle: widget.subtitle,
            accent: widget.accent,
          ),
          const SizedBox(height: 12),
          if (entries.isEmpty)
            Text(widget.emptyMessage)
          else ...[
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 248),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final size = constraints.biggest;
                      void track(Offset position) =>
                          _track(position, size, share);
                      return MouseRegion(
                        onHover: (event) => track(event.localPosition),
                        onExit: (_) => _clearPreview(),
                        child: GestureDetector(
                          excludeFromSemantics: true,
                          onTap: () => _select(null),
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              RepaintBoundary(
                                child: CustomPaint(
                                  painter: _TickRing(
                                    share,
                                    selected,
                                    motion: _motion,
                                    angle: () => _angle,
                                    lift: () => _lift,
                                    reducedMotion: reducedMotion,
                                  ),
                                  child: Center(
                                    child: SizedBox(
                                      width: size.width * .56,
                                      child: Semantics(
                                        liveRegion:
                                            _touchFocus == null &&
                                            _selected != null,
                                        child: Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            FittedBox(
                                              fit: BoxFit.scaleDown,
                                              child: Text(
                                                selected == null
                                                    ? compactInr(total)
                                                    : _percent(share[selected]),
                                                style: const TextStyle(
                                                  fontSize: 31,
                                                  fontWeight: FontWeight.w900,
                                                  height: 1.05,
                                                ),
                                              ),
                                            ),
                                            const SizedBox(height: 5),
                                            Text(
                                              selected == null
                                                  ? 'Total spent'
                                                  : entries[selected].label,
                                              maxLines: 2,
                                              textAlign: TextAlign.center,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              GestureDetector(
                                excludeFromSemantics: true,
                                onTapUp: (details) {
                                  track(details.localPosition);
                                  _select(_touchFocus?.segment);
                                  _clearPreview();
                                },
                                onPanDown: (details) =>
                                    track(details.localPosition),
                                onPanUpdate: (details) =>
                                    track(details.localPosition),
                                onPanEnd: (_) => _clearPreview(),
                                onPanCancel: _clearPreview,
                                child: CustomPaint(
                                  painter: _RingHitTarget(size),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            for (var i = 0; i < entries.length; i++)
              Semantics(
                selected: selected == i,
                button: true,
                child: InkWell(
                  onTap: () => _select(i),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48),
                    padding: const EdgeInsets.symmetric(
                      vertical: 5,
                      horizontal: 7,
                    ),
                    decoration: BoxDecoration(
                      color: selected == i ? Colors.white : null,
                      border: Border(
                        bottom: BorderSide(
                          color: FinStackColors.onSurface.withValues(
                            alpha: .23,
                          ),
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 13,
                          height: 13,
                          decoration: BoxDecoration(
                            color: _colors[i],
                            border: Border.all(color: FinStackColors.onSurface),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            entries[i].label,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          widget.formatAmount(entries[i].value),
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(width: 8),
                        Text(_percent(share[i])),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

String _percent(double share) {
  final percent = share * 100;
  if (percent < .1) return '<0.1%';
  return '${percent.toStringAsFixed(percent % 1 == 0 ? 0 : 1)}%';
}

const _turn = 2 * math.pi;

class _RingHitTarget extends CustomPainter {
  const _RingHitTarget(this.size);
  final Size size;

  @override
  bool hitTest(Offset position) {
    final radius = (position - size.center(Offset.zero)).distance / size.width;
    return radius >= .28 && radius <= .5;
  }

  @override
  void paint(Canvas canvas, Size size) {}

  @override
  bool shouldRepaint(_RingHitTarget oldDelegate) => false;
}

class _TickRing extends CustomPainter {
  _TickRing(
    this.shares,
    this.selected, {
    required Animation<double> motion,
    required this.angle,
    required this.lift,
    required this.reducedMotion,
  }) : super(repaint: motion);

  final double Function() angle;
  final double Function() lift;
  final bool reducedMotion;

  final List<double> shares;
  final int? selected;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide / 2;
    final focusAngle = angle();
    final liftAmount = reducedMotion ? 0 : lift();
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = radius * .029;
    var start = -math.pi / 2;
    for (var i = 0; i < shares.length; i++) {
      final sweep = shares[i] * 2 * math.pi;
      final active = selected == i;
      final color = _colors[i];
      paint.color = selected == null || active
          ? color
          : color.withValues(alpha: .28);
      final gap = shares.length > 1 ? math.min(sweep * .24, .085) : 0.0;
      final count = math.max(1, ((sweep - gap) / (2 * math.pi) * 96).round());
      for (var tick = 0; tick < count; tick++) {
        final angle = start + gap / 2 + (tick + .5) / count * (sweep - gap);
        final direction = Offset(math.cos(angle), math.sin(angle));
        final distance = ((angle - focusAngle + math.pi) % _turn - math.pi)
            .abs();
        final bump = math.max(0.0, 1 - distance / .19) * liftAmount;
        paint.strokeWidth = radius * (.029 + .016 * bump);
        canvas.drawLine(
          center + direction * (radius * .66),
          center +
              direction * (radius * ((active ? .936 : .895) + .081 * bump)),
          paint,
        );
      }
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_TickRing oldDelegate) =>
      oldDelegate.selected != selected ||
      !listEquals(oldDelegate.shares, shares) ||
      oldDelegate.reducedMotion != reducedMotion;
}
