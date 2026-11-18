import 'package:flutter/material.dart';
import '../theme/finstack_theme.dart';

class BrutalCard extends StatelessWidget {
  final Widget child;
  final Color color;
  final EdgeInsets padding;
  final double shadow;
  final double border;
  const BrutalCard({
    super.key,
    required this.child,
    this.color = Colors.white,
    this.padding = const EdgeInsets.all(16),
    this.shadow = 4,
    this.border = 3,
  });
  @override
  Widget build(BuildContext context) => Container(
        decoration: brutal(color: color, border: border, shadow: shadow),
        padding: padding,
        child: child,
      );
}

/// Pressable, hard-shadow button. Replaces Material's soft elevation with the
/// site's 2px border + offset ink shadow, and shifts on press.
class BrutalButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color? color;
  final Color? textColor;
  final bool block;
  final EdgeInsets padding;
  final double fontSize;
  final double shadow;
  const BrutalButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.color,
    this.textColor,
    this.block = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
    this.fontSize = 12,
    this.shadow = 3,
  });

  @override
  State<BrutalButton> createState() => _BrutalButtonState();
}

class _BrutalButtonState extends State<BrutalButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;
    final bg = widget.color ?? FinStackColors.brandYellow;
    final fg = widget.textColor ?? FinStackColors.onSurface;
    final shift = _down && enabled ? 2.0 : 0.0;
    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.label,
      onTap: widget.onPressed,
      child: MouseRegion(
        cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: enabled ? (_) => setState(() => _down = true) : null,
          onTapUp: enabled ? (_) => setState(() => _down = false) : null,
          onTapCancel: enabled ? () => setState(() => _down = false) : null,
          onTap: widget.onPressed,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 90),
            curve: Curves.easeOut,
            transform: Matrix4.translationValues(shift, shift, 0),
            padding: widget.padding,
            decoration: BoxDecoration(
              color: enabled ? bg : bg.withValues(alpha: 0.45),
              border: Border.all(color: FinStackColors.onSurface, width: 2),
              boxShadow: enabled && !_down
                  ? [
                      BoxShadow(
                        color: FinStackColors.onSurface,
                        offset: Offset(widget.shadow, widget.shadow),
                        blurRadius: 0,
                      )
                    ]
                  : const [],
            ),
            child: Row(
              mainAxisSize: widget.block ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (widget.icon != null) ...[
                  Icon(widget.icon, size: widget.fontSize + 5, color: fg),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Text(
                    widget.label.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: widget.fontSize,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: fg,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Square icon button used in app bars and compact toolbars.
class BrutalIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;
  final Color color;
  final double size;
  const BrutalIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.color = FinStackColors.brandYellow,
    this.size = 38,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        onTap: onPressed,
        child: GestureDetector(
          onTap: onPressed,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: color,
              border: Border.all(color: FinStackColors.onSurface, width: 2),
              boxShadow: const [
                BoxShadow(
                  color: FinStackColors.onSurface,
                  offset: Offset(2, 2),
                  blurRadius: 0,
                )
              ],
            ),
            child: Icon(icon, size: size * 0.5),
          ),
        ),
      ),
    );
  }
}

class BrutalField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final bool obscure;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? prefixText;
  final String? suffixText;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final bool enabled;
  final TextCapitalization textCapitalization;
  const BrutalField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.obscure = false,
    this.keyboardType,
    this.textInputAction,
    this.prefixText,
    this.suffixText,
    this.maxLines = 1,
    this.onChanged,
    this.enabled = true,
    this.textCapitalization = TextCapitalization.none,
  });

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
              color: FinStackColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 6),
          TextField(
            controller: controller,
            obscureText: obscure,
            enabled: enabled,
            keyboardType: keyboardType,
            textInputAction: textInputAction,
            maxLines: obscure ? 1 : maxLines,
            onChanged: onChanged,
            textCapitalization: textCapitalization,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: FinStackColors.onSurface,
            ),
            decoration: InputDecoration(
              hintText: hint,
              prefixText: prefixText,
              suffixText: suffixText,
            ),
          ),
        ],
      );
}

class BrutalTag extends StatelessWidget {
  final String label;
  final Color color;
  final Color textColor;
  final IconData? icon;
  const BrutalTag({
    super.key,
    required this.label,
    this.color = FinStackColors.brandYellow,
    this.textColor = FinStackColors.onSurface,
    this.icon,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: color,
          border: Border.all(color: FinStackColors.onSurface, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 11, color: textColor),
              const SizedBox(width: 4),
            ],
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.7,
                color: textColor,
              ),
            ),
          ],
        ),
      );
}

class BrutalSectionTitle extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Color accent;
  const BrutalSectionTitle({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.accent = FinStackColors.brandYellow,
  });

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 8, height: 18, color: accent),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.1,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 3),
            Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Text(
                subtitle!,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: FinStackColors.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ],
      );
}

/// Faint 24px planning grid — the site's `.bg-grid-pattern`.
class BrutalGrid extends StatelessWidget {
  final Widget child;
  final Color? color;
  const BrutalGrid({super.key, required this.child, this.color});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _GridPainter(
        color: color ?? FinStackColors.onSurface.withValues(alpha: 0.055),
      ),
      child: child,
    );
  }
}

class _GridPainter extends CustomPainter {
  final Color color;
  const _GridPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    const step = 24.0;
    for (var x = 0.0; x <= size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.0; y <= size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter oldDelegate) =>
      oldDelegate.color != color;
}
