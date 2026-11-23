import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The dynamic half of the palette. Accents stay fixed across modes so the
/// brand still reads as FinStack; paper, ink and status colors flip.
class FinStackPalette {
  const FinStackPalette({
    required this.brightness,
    required this.onSurface,
    required this.onSurfaceVariant,
    required this.surface,
    required this.surfaceLow,
    required this.surfaceContainer,
    required this.surfaceHigh,
    required this.surfaceVariant,
    required this.outlineVariant,
    required this.accentSurface,
    required this.shadow,
    required this.inverseSurface,
    required this.onInverse,
    required this.errorContainer,
    required this.onErrorContainer,
    required this.successContainer,
    required this.successInk,
    required this.chartGrid,
    required this.scrim,
  });

  final Brightness brightness;
  final Color onSurface;
  final Color onSurfaceVariant;
  final Color surface;
  final Color surfaceLow;
  final Color surfaceContainer;
  final Color surfaceHigh;
  final Color surfaceVariant;
  final Color outlineVariant;
  final Color accentSurface;
  final Color shadow;
  final Color inverseSurface;
  final Color onInverse;
  final Color errorContainer;
  final Color onErrorContainer;
  final Color successContainer;
  final Color successInk;
  final Color chartGrid;
  final Color scrim;
}

const lightPalette = FinStackPalette(
  brightness: Brightness.light,
  onSurface: Color(0xFF11110E),
  onSurfaceVariant: Color(0xFF5C594F),
  surface: Color(0xFFFFFFFF),
  surfaceLow: Color(0xFFFAF5E6),
  surfaceContainer: Color(0xFFF2EBD5),
  surfaceHigh: Color(0xFFEEE7D2),
  surfaceVariant: Color(0xFFEAE3D0),
  outlineVariant: Color(0xFFD8CEB7),
  accentSurface: Color(0xFFFFE500),
  shadow: Color(0xFF11110E),
  inverseSurface: Color(0xFF11110E),
  onInverse: Color(0xFFFFFFFF),
  errorContainer: Color(0xFFFFD6DC),
  onErrorContainer: Color(0xFFB4152E),
  successContainer: Color(0xFFDCFCE7),
  successInk: Color(0xFF0D7A4B),
  chartGrid: Color(0x1A11110E),
  scrim: Color(0x8A11110E),
);

// Night ledger: warm charcoal paper, cream ink, black offset shadows. The
// electric accents are unchanged, so yellow still behaves like a highlighter.
const darkPalette = FinStackPalette(
  brightness: Brightness.dark,
  onSurface: Color(0xFFF4EEDC),
  onSurfaceVariant: Color(0xFFB7AD97),
  surface: Color(0xFF1B1914),
  surfaceLow: Color(0xFF12110E),
  surfaceContainer: Color(0xFF221F18),
  surfaceHigh: Color(0xFF2A261D),
  surfaceVariant: Color(0xFF322D22),
  outlineVariant: Color(0xFF4A4334),
  accentSurface: Color(0xFF423800),
  shadow: Color(0xFF050504),
  inverseSurface: Color(0xFF070605),
  onInverse: Color(0xFFF4EEDC),
  errorContainer: Color(0xFF4A131B),
  onErrorContainer: Color(0xFFFFB4C0),
  successContainer: Color(0xFF0F2A1B),
  successInk: Color(0xFF7BE3A7),
  chartGrid: Color(0x33F4EEDC),
  scrim: Color(0xCC000000),
);

class FinStackColors {
  static FinStackPalette _palette = lightPalette;

  static void setDark(bool dark) {
    _palette = dark ? darkPalette : lightPalette;
  }

  static bool get isDark => _palette.brightness == Brightness.dark;

  static Color get onSurface => _palette.onSurface;
  static Color get onSurfaceVariant => _palette.onSurfaceVariant;
  static Color get surface => _palette.surface;
  static Color get surfaceLow => _palette.surfaceLow;
  static Color get surfaceContainer => _palette.surfaceContainer;
  static Color get surfaceHigh => _palette.surfaceHigh;
  static Color get surfaceVariant => _palette.surfaceVariant;
  static Color get outlineVariant => _palette.outlineVariant;
  static Color get accentSurface => _palette.accentSurface;
  static Color get shadow => _palette.shadow;
  static Color get inverseSurface => _palette.inverseSurface;
  static Color get onInverse => _palette.onInverse;
  static Color get errorContainer => _palette.errorContainer;
  static Color get onErrorContainer => _palette.onErrorContainer;
  static Color get successContainer => _palette.successContainer;
  static Color get successInk => _palette.successInk;
  static Color get chartGrid => _palette.chartGrid;
  static Color get scrim => _palette.scrim;

  // Ink that reads on any filled swatch: dark ink on yellow/cyan, cream on
  // charcoal or the deep gold accent surface.
  static Color inkOn(Color background) =>
      ThemeData.estimateBrightnessForColor(background) == Brightness.dark
      ? _palette.onInverse
      : lightPalette.onSurface;

  static const brandYellow = Color(0xFFFFE500);
  static const tertiary = Color(0xFF00F0FF);
  static const accentCyan = Color(0xFF00F0FF);
  static const onTertiaryContainer = Color(0xFF007171);
  static const accentPink = Color(0xFFFF3B7F);
  static const accentPurple = Color(0xFF7C5CFF);
  static const accentOrange = Color(0xFFFF6B35);
  static const accentGreen = Color(0xFF4ADE80);
  static const accentBlue = Color(0xFF2F80ED);

  // Chart series aligned with the web chart kit.
  static const accentTeal = Color(0xFF00B894);
  static const chartTeal = Color(0xFF0E8F8B);
  static const chartPink = Color(0xFFD43A6C);
  static const chartAmber = Color(0xFFB58900);

  static const series = [
    brandYellow,
    accentCyan,
    accentPink,
    accentPurple,
    accentOrange,
    chartAmber,
    accentGreen,
    accentBlue,
  ];
}

class FinStackType {
  static const display = 'Space Grotesk';
  static const body = 'Plus Jakarta Sans';
  static const mono = 'JetBrains Mono';

  // Palette-aware so captions stay muted on cream and readable on charcoal.
  static TextStyle get caption => TextStyle(
    fontFamily: mono,
    fontSize: 10,
    fontWeight: FontWeight.w800,
    letterSpacing: .45,
    color: FinStackColors.onSurfaceVariant,
  );

  static const amount = TextStyle(
    fontFamily: mono,
    fontSize: 19,
    fontWeight: FontWeight.w800,
    letterSpacing: -.6,
  );
}

BoxDecoration brutal({
  Color? color,
  double border = 2.5,
  double shadow = 5,
  Color? shadowColor,
}) => BoxDecoration(
  color: color ?? FinStackColors.surface,
  border: Border.all(color: FinStackColors.onSurface, width: border),
  boxShadow: [
    if (shadow > 0)
      BoxShadow(
        color: shadowColor ?? FinStackColors.shadow,
        offset: Offset(shadow, shadow),
        blurRadius: 0,
      ),
  ],
);

ThemeData finStackTheme({bool dark = false}) {
  final palette = dark ? darkPalette : lightPalette;
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: FinStackType.body,
    brightness: palette.brightness,
  );
  final textTheme = base.textTheme.copyWith(
    displayLarge: TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 48,
      fontWeight: FontWeight.w700,
      height: 0.95,
      letterSpacing: -1.2,
      color: palette.onSurface,
    ),
    headlineLarge: TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 30,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      color: palette.onSurface,
    ),
    headlineMedium: TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 24,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.4,
      color: palette.onSurface,
    ),
    titleLarge: TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 20,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.2,
      color: palette.onSurface,
    ),
    titleMedium: TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 16,
      fontWeight: FontWeight.w700,
      color: palette.onSurface,
    ),
    labelLarge: TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 12,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
      color: palette.onSurface,
    ),
    labelSmall: FinStackType.caption.copyWith(color: palette.onSurfaceVariant),
    bodyMedium: TextStyle(
      fontFamily: FinStackType.body,
      fontSize: 14,
      fontWeight: FontWeight.w500,
      color: palette.onSurface,
    ),
    bodySmall: TextStyle(
      fontFamily: FinStackType.body,
      fontSize: 12,
      fontWeight: FontWeight.w500,
      color: palette.onSurfaceVariant,
    ),
  );
  final scheme = dark
      ? ColorScheme.dark(
          primary: palette.onSurface,
          onPrimary: palette.surfaceLow,
          secondary: FinStackColors.tertiary,
          onSecondary: palette.surfaceLow,
          surface: palette.surface,
          onSurface: palette.onSurface,
          onSurfaceVariant: palette.onSurfaceVariant,
          error: palette.onErrorContainer,
          onError: palette.errorContainer,
          outline: palette.onSurface,
          outlineVariant: palette.outlineVariant,
        )
      : ColorScheme.light(
          primary: palette.onSurface,
          onPrimary: palette.onInverse,
          secondary: FinStackColors.tertiary,
          onSecondary: palette.onSurface,
          surface: palette.surface,
          onSurface: palette.onSurface,
          onSurfaceVariant: palette.onSurfaceVariant,
          error: palette.onErrorContainer,
          onError: palette.errorContainer,
          outline: palette.onSurface,
          outlineVariant: palette.outlineVariant,
        );

  return base.copyWith(
    scaffoldBackgroundColor: palette.surfaceLow,
    canvasColor: palette.surfaceLow,
    colorScheme: scheme,
    textTheme: textTheme,
    pageTransitionsTheme: PageTransitionsTheme(
      builders: {
        ...base.pageTransitionsTheme.builders,
        TargetPlatform.iOS: const CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: const CupertinoPageTransitionsBuilder(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: palette.surface,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      foregroundColor: palette.onSurface,
      toolbarHeight: 56,
      titleSpacing: 14,
      systemOverlayStyle:
          dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: palette.onSurface,
      ),
      shape: Border(
        bottom: BorderSide(color: palette.onSurface, width: 2.5),
      ),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: palette.surface,
      surfaceTintColor: Colors.transparent,
      scrimColor: palette.scrim,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: FinStackColors.brandYellow,
        foregroundColor: lightPalette.onSurface,
        side: BorderSide(color: palette.onSurface, width: 2),
        elevation: 0,
        shadowColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          fontSize: 12,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        backgroundColor: palette.surface,
        foregroundColor: palette.onSurface,
        side: BorderSide(color: palette.onSurface, width: 2),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: palette.onSurface,
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: palette.onSurface, width: 2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: palette.onSurface, width: 2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: palette.onSurface, width: 3),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: palette.onErrorContainer, width: 2),
      ),
      hintStyle: TextStyle(
        color: palette.onSurface.withValues(alpha: 0.5),
      ),
      labelStyle: TextStyle(
        fontWeight: FontWeight.w700,
        fontSize: 12,
        color: palette.onSurfaceVariant,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    ),
    dividerTheme: DividerThemeData(
      color: palette.onSurface,
      thickness: 2,
      space: 16,
    ),
    cardTheme: CardThemeData(
      color: palette.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: palette.onSurface, width: 3),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: palette.surface,
      selectedColor: FinStackColors.accentSurface,
      checkmarkColor: palette.onSurface,
      side: BorderSide(color: palette.onSurface, width: 2),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      labelStyle: TextStyle(
        fontWeight: FontWeight.w800,
        fontSize: 11,
        letterSpacing: 0.4,
        color: palette.onSurface,
      ),
      secondaryLabelStyle: TextStyle(
        fontWeight: FontWeight.w800,
        fontSize: 11,
        color: palette.onSurface,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: palette.onSurface,
      contentTextStyle: TextStyle(
        color: palette.surfaceLow,
        fontWeight: FontWeight.w700,
        fontSize: 12,
      ),
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.brandYellow, width: 2),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: palette.onSurface, width: 3),
      ),
      titleTextStyle: TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: palette.onSurface,
      ),
      contentTextStyle: TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: palette.onSurfaceVariant,
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: palette.surface,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: palette.surface,
      modalBarrierColor: palette.scrim,
      elevation: 0,
      showDragHandle: false,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: palette.onSurface, width: 3),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: palette.onSurface,
      linearTrackColor: palette.surfaceVariant,
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: FinStackColors.brandYellow,
      foregroundColor: lightPalette.onSurface,
      elevation: 2,
      focusElevation: 2,
      hoverElevation: 2,
      highlightElevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: palette.onSurface, width: 2),
      ),
    ),
    iconTheme: IconThemeData(color: palette.onSurface),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: palette.onSurface,
        border: Border.all(color: FinStackColors.brandYellow, width: 2),
      ),
      textStyle: TextStyle(
        color: palette.surfaceLow,
        fontWeight: FontWeight.w700,
        fontSize: 11,
      ),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: palette.onSurface,
      selectionColor: const Color(0x66FFE500),
      selectionHandleColor: palette.onSurface,
    ),
    dividerColor: palette.onSurface,
  );
}
