import 'package:flutter/material.dart';
import '../theme/finstack_theme.dart';

/// Closes the keyboard before navigation or a network action. Numeric pads on
/// iOS have no return key, so every action that leaves the field must do this.
void dismissKeyboard(BuildContext context) {
  FocusManager.instance.primaryFocus?.unfocus();
  FocusScope.of(context).unfocus();
}

class BrutalCard extends StatelessWidget {
  final Widget child;
  final Color? color;
  final EdgeInsets padding;
  final double shadow;
  final double border;
  final Color? shadowColor;
  const BrutalCard({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(14),
    this.shadow = 5,
    this.border = 2.5,
    this.shadowColor,
  });
  @override
  Widget build(BuildContext context) => Container(
    decoration: brutal(
      color: color,
      border: border,
      shadow: shadow,
      shadowColor: shadowColor,
    ),
    padding: padding,
    child: child,
  );
}

class FinStackMark extends StatelessWidget {
  const FinStackMark({super.key, this.size = 34});

  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: brutal(
        color: FinStackColors.brandYellow,
        shadow: size >= 70 ? 7 : 2.5,
      ),
      child: Text(
        'F',
        style: TextStyle(
          fontFamily: FinStackType.display,
          fontSize: size * .56,
          fontWeight: FontWeight.w700,
          height: 1,
          color: lightPalette.onSurface,
        ),
      ),
    ),
  );
}

class FinStackTitle extends StatelessWidget {
  const FinStackTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      const FinStackMark(),
      const SizedBox(width: 10),
      Flexible(
        child: Text(
          title.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).appBarTheme.titleTextStyle,
        ),
      ),
    ],
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
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;
    final bg = widget.color ?? FinStackColors.brandYellow;
    final fg = widget.textColor ?? FinStackColors.inkOn(bg);
    final shift = _down && enabled ? 2.0 : 0.0;
    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.label,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          mouseCursor: enabled
              ? SystemMouseCursors.click
              : SystemMouseCursors.basic,
          onTap: widget.onPressed,
          onHighlightChanged: enabled
              ? (down) => setState(() => _down = down)
              : null,
          splashFactory: NoSplash.splashFactory,
          highlightColor: Colors.transparent,
          onFocusChange: (focused) => setState(() => _focused = focused),
          child: AnimatedContainer(
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 90),
            curve: Curves.easeOut,
            transform: Matrix4.translationValues(shift, shift, 0),
            padding: widget.padding,
            decoration: BoxDecoration(
              color: enabled ? bg : bg.withValues(alpha: 0.45),
              border: Border.all(
                color: _focused
                    ? FinStackColors.accentBlue
                    : FinStackColors.onSurface,
                width: 2.5,
              ),
              boxShadow: enabled && !_down
                  ? [
                      BoxShadow(
                        color: FinStackColors.shadow,
                        offset: Offset(widget.shadow, widget.shadow),
                        blurRadius: 0,
                      ),
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
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: FinStackType.display,
                      fontSize: widget.fontSize,
                      fontWeight: FontWeight.w700,
                      height: 1.18,
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
    final background = onPressed == null
        ? FinStackColors.surfaceContainer
        : color;
    final ink = FinStackColors.inkOn(background);
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      padding: EdgeInsets.zero,
      constraints: BoxConstraints(
        minWidth: size < 44 ? 44 : size,
        minHeight: size < 44 ? 44 : size,
      ),
      icon: Container(
        width: size,
        height: size,
        decoration: brutal(color: background, border: 2, shadow: 2),
        alignment: Alignment.center,
        child: Icon(icon, size: size * .5, color: ink),
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
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final bool enableSuggestions;
  final bool autocorrect;
  final Widget? suffixIcon;
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
    this.onSubmitted,
    this.enabled = true,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.enableSuggestions = true,
    this.autocorrect = true,
    this.suffixIcon,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label.toUpperCase(), style: FinStackType.caption),
      const SizedBox(height: 6),
      TextField(
        controller: controller,
        obscureText: obscure,
        enabled: enabled,
        keyboardType: keyboardType,
        textInputAction: textInputAction,
        maxLines: obscure ? 1 : maxLines,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        textCapitalization: textCapitalization,
        autofillHints: autofillHints,
        enableSuggestions: enableSuggestions,
        autocorrect: autocorrect,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: FinStackColors.onSurface,
        ),
        decoration: InputDecoration(
          hintText: hint,
          prefixText: prefixText,
          suffixText: suffixText,
          suffixIcon: suffixIcon,
        ),
      ),
    ],
  );
}

class BrutalTag extends StatelessWidget {
  final String label;
  final Color? color;
  final Color? textColor;
  final IconData? icon;
  const BrutalTag({
    super.key,
    required this.label,
    this.color,
    this.textColor,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final background = color ?? FinStackColors.surface;
    final foreground = textColor ?? FinStackColors.inkOn(background);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: FinStackColors.onSurface, width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: foreground),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: FinStackType.mono,
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.45,
                color: foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
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
          Container(
            width: 6,
            height: 17,
            decoration: brutal(color: accent, border: 1, shadow: 0),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title.toUpperCase(),
              style: const TextStyle(
                fontFamily: FinStackType.display,
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
      if (subtitle != null) ...[
        const SizedBox(height: 3),
        Text(
          subtitle!,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: FinStackColors.onSurfaceVariant,
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

class BrutalNavItem {
  final String label;
  final IconData icon;
  const BrutalNavItem(this.label, this.icon);
}

/// iOS-style bottom navigation in the FinStack neo-brutalist language: hard
/// ink border on top, yellow block for the active destination, and an optional
/// raised centre action.
class BrutalBottomNav extends StatelessWidget {
  final int index;
  final List<BrutalNavItem> items;
  final int? actionIndex;
  final ValueChanged<int> onTap;
  const BrutalBottomNav({
    super.key,
    required this.index,
    required this.items,
    required this.onTap,
    this.actionIndex,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: FinStackColors.surface,
        border: Border(
          top: BorderSide(color: FinStackColors.onSurface, width: 3),
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 3, 4, 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(child: _item(i)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _item(int i) {
    final item = items[i];
    final active = i == index;
    final isAction = i == actionIndex;
    return Semantics(
      button: true,
      selected: active,
      label: item.label,
      child: InkWell(
        onTap: () => onTap(i),
        splashColor: FinStackColors.brandYellow.withValues(alpha: 0.35),
        highlightColor: Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (isAction)
                Container(
                  width: 40,
                  height: 36,
                  decoration: BoxDecoration(
                    color: FinStackColors.accentSurface,
                    border: Border.all(
                      color: FinStackColors.onSurface,
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: FinStackColors.shadow,
                        offset: Offset(3, 3),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: Icon(item.icon, size: 21),
                )
              else
                Container(
                  width: 34,
                  height: 28,
                  decoration: active
                      ? brutal(
                          color: FinStackColors.accentSurface,
                          border: 2,
                          shadow: 2,
                        )
                      : null,
                  child: Icon(item.icon, size: 19),
                ),
              const SizedBox(height: 3),
              Text(
                item.label.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: FinStackType.mono,
                  fontSize: 8.5,
                  fontWeight: active ? FontWeight.w900 : FontWeight.w700,
                  letterSpacing: 0.3,
                  color: active
                      ? FinStackColors.onSurface
                      : FinStackColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
