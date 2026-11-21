import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class FinStackColors {
  static const onSurface = Color(0xFF11110E);
  static const onSurfaceVariant = Color(0xFF5C594F);
  static const surfaceLow = Color(0xFFFAF5E6);
  static const surfaceContainer = Color(0xFFF2EBD5);
  static const surfaceHigh = Color(0xFFEEE7D2);
  static const surfaceVariant = Color(0xFFEAE3D0);
  static const outlineVariant = Color(0xFFD8CEB7);
  static const brandYellow = Color(0xFFFFE500);
  static const tertiary = Color(0xFF00F0FF);
  static const accentCyan = Color(0xFF00F0FF);
  static const onTertiaryContainer = Color(0xFF007171);
  static const errorContainer = Color(0xFFFFD6DC);
  static const onErrorContainer = Color(0xFFB4152E);

  static const accentPink = Color(0xFFFF3B7F);
  static const accentPurple = Color(0xFF7C5CFF);
  static const accentOrange = Color(0xFFFF6B35);
  static const accentGreen = Color(0xFF4ADE80);
  static const accentBlue = Color(0xFF2F80ED);

  // Chart series aligned with the web chart kit.
  static const accentTeal = Color(0xFF00B894);
  static const successInk = Color(0xFF0D7A4B);
  static const successContainer = Color(0xFFDCFCE7);
  static const chartTeal = Color(0xFF0E8F8B);
  static const chartPink = Color(0xFFD43A6C);
  static const chartAmber = Color(0xFFB58900);
  static const chartGrid = Color(0x1A11110E);

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

  static const caption = TextStyle(
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
  Color color = Colors.white,
  double border = 2.5,
  double shadow = 5,
  Color shadowColor = FinStackColors.onSurface,
}) => BoxDecoration(
  color: color,
  border: Border.all(color: FinStackColors.onSurface, width: border),
  boxShadow: [
    if (shadow > 0)
      BoxShadow(
        color: shadowColor,
        offset: Offset(shadow, shadow),
        blurRadius: 0,
      ),
  ],
);

ThemeData finStackTheme() {
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: FinStackType.body,
    brightness: Brightness.light,
  );
  final textTheme = base.textTheme.copyWith(
    displayLarge: const TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 48,
      fontWeight: FontWeight.w700,
      height: 0.95,
      letterSpacing: -1.2,
      color: FinStackColors.onSurface,
    ),
    headlineLarge: const TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 30,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      color: FinStackColors.onSurface,
    ),
    headlineMedium: const TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 24,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.4,
      color: FinStackColors.onSurface,
    ),
    titleLarge: const TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 20,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.2,
      color: FinStackColors.onSurface,
    ),
    titleMedium: const TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 16,
      fontWeight: FontWeight.w700,
      color: FinStackColors.onSurface,
    ),
    labelLarge: const TextStyle(
      fontFamily: FinStackType.display,
      fontSize: 12,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
      color: FinStackColors.onSurface,
    ),
    labelSmall: FinStackType.caption,
    bodyMedium: const TextStyle(
      fontFamily: FinStackType.body,
      fontSize: 14,
      fontWeight: FontWeight.w500,
      color: FinStackColors.onSurface,
    ),
    bodySmall: const TextStyle(
      fontFamily: FinStackType.body,
      fontSize: 12,
      fontWeight: FontWeight.w500,
      color: FinStackColors.onSurfaceVariant,
    ),
  );

  return base.copyWith(
    scaffoldBackgroundColor: FinStackColors.surfaceLow,
    canvasColor: FinStackColors.surfaceLow,
    colorScheme: const ColorScheme.light(
      primary: FinStackColors.onSurface,
      onPrimary: Colors.white,
      secondary: FinStackColors.tertiary,
      onSecondary: FinStackColors.onSurface,
      surface: Colors.white,
      onSurface: FinStackColors.onSurface,
      onSurfaceVariant: FinStackColors.onSurfaceVariant,
      error: FinStackColors.onErrorContainer,
      onError: FinStackColors.errorContainer,
      outline: FinStackColors.onSurface,
      outlineVariant: FinStackColors.outlineVariant,
    ),
    textTheme: textTheme,
    pageTransitionsTheme: PageTransitionsTheme(
      builders: {
        ...base.pageTransitionsTheme.builders,
        TargetPlatform.iOS: const CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: const CupertinoPageTransitionsBuilder(),
      },
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      foregroundColor: FinStackColors.onSurface,
      toolbarHeight: 56,
      titleSpacing: 14,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: FinStackColors.onSurface,
      ),
      shape: Border(
        bottom: BorderSide(color: FinStackColors.onSurface, width: 2.5),
      ),
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      scrimColor: Color(0x8A11110E),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: FinStackColors.brandYellow,
        foregroundColor: FinStackColors.onSurface,
        side: const BorderSide(color: FinStackColors.onSurface, width: 2),
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
        backgroundColor: Colors.white,
        foregroundColor: FinStackColors.onSurface,
        side: const BorderSide(color: FinStackColors.onSurface, width: 2),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: FinStackColors.onSurface,
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: FinStackColors.onSurface, width: 2),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: FinStackColors.onSurface, width: 2),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      errorBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(
          color: FinStackColors.onErrorContainer,
          width: 2,
        ),
      ),
      hintStyle: TextStyle(
        color: FinStackColors.onSurface.withValues(alpha: 0.5),
      ),
      labelStyle: const TextStyle(
        fontWeight: FontWeight.w700,
        fontSize: 12,
        color: FinStackColors.onSurfaceVariant,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    ),
    dividerTheme: const DividerThemeData(
      color: FinStackColors.onSurface,
      thickness: 2,
      space: 16,
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: FinStackColors.brandYellow,
      checkmarkColor: FinStackColors.onSurface,
      side: const BorderSide(color: FinStackColors.onSurface, width: 2),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      labelStyle: const TextStyle(
        fontWeight: FontWeight.w800,
        fontSize: 11,
        letterSpacing: 0.4,
        color: FinStackColors.onSurface,
      ),
      secondaryLabelStyle: const TextStyle(
        fontWeight: FontWeight.w800,
        fontSize: 11,
        color: FinStackColors.onSurface,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: FinStackColors.onSurface,
      contentTextStyle: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: 12,
      ),
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.brandYellow, width: 2),
      ),
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
      titleTextStyle: TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: FinStackColors.onSurface,
      ),
      contentTextStyle: TextStyle(
        fontFamily: FinStackType.display,
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: FinStackColors.onSurfaceVariant,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: Colors.white,
      modalBarrierColor: Color(0x9911110E),
      elevation: 0,
      showDragHandle: false,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: FinStackColors.onSurface,
      linearTrackColor: FinStackColors.surfaceVariant,
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: FinStackColors.brandYellow,
      foregroundColor: FinStackColors.onSurface,
      elevation: 2,
      focusElevation: 2,
      hoverElevation: 2,
      highlightElevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: FinStackColors.onSurface, width: 2),
      ),
    ),
    iconTheme: const IconThemeData(color: FinStackColors.onSurface),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: FinStackColors.onSurface,
        border: Border.all(color: FinStackColors.brandYellow, width: 2),
      ),
      textStyle: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: 11,
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: FinStackColors.onSurface,
      selectionColor: Color(0x66FFE500),
      selectionHandleColor: FinStackColors.onSurface,
    ),
    dividerColor: FinStackColors.onSurface,
  );
}
