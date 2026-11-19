import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FinStackColors {
  static const onSurface = Color(0xFF1E1C10);
  static const onSurfaceVariant = Color(0xFF4B4731);
  static const surfaceLow = Color(0xFFFAF3DF);
  static const surfaceContainer = Color(0xFFF4EEDA);
  static const surfaceHigh = Color(0xFFEEE8D4);
  static const surfaceVariant = Color(0xFFE9E2CF);
  static const outlineVariant = Color(0xFFCEC7AA);
  static const brandYellow = Color(0xFFFFE500);
  static const tertiary = Color(0xFF00FCFB);
  static const accentCyan = Color(0xFF00FCFB);
  static const onTertiaryContainer = Color(0xFF007171);
  static const errorContainer = Color(0xFFFFDAD6);
  static const onErrorContainer = Color(0xFF93000A);

  static const accentPink = Color(0xFFE8487F);
  static const accentPurple = Color(0xFF7B61FF);
  static const accentOrange = Color(0xFFFF7A45);
  static const accentGreen = Color(0xFF6BCB77);
  static const accentBlue = Color(0xFF4D96FF);

  // Chart series aligned with the web chart kit.
  static const chartTeal = Color(0xFF0E8F8B);
  static const chartPink = Color(0xFFD43A6C);
  static const chartAmber = Color(0xFFB58900);
  static const chartGrid = Color(0x1A1E1C10);

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

BoxDecoration brutal({
  Color color = Colors.white,
  double border = 3,
  double shadow = 4,
}) =>
    BoxDecoration(
      color: color,
      border: Border.all(color: FinStackColors.onSurface, width: border),
      boxShadow: [
        BoxShadow(
          color: FinStackColors.onSurface,
          offset: Offset(shadow, shadow),
          blurRadius: 0,
        ),
      ],
    );

ThemeData finStackTheme() {
  final base = ThemeData.light(useMaterial3: true);
  final textTheme = GoogleFonts.spaceGroteskTextTheme().copyWith(
    displayLarge: const TextStyle(
      fontSize: 48,
      fontWeight: FontWeight.w700,
      height: 0.95,
      letterSpacing: -1.2,
      color: FinStackColors.onSurface,
    ),
    headlineLarge: const TextStyle(
      fontSize: 30,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      color: FinStackColors.onSurface,
    ),
    headlineMedium: const TextStyle(
      fontSize: 24,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.4,
      color: FinStackColors.onSurface,
    ),
    titleLarge: const TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.2,
      color: FinStackColors.onSurface,
    ),
    titleMedium: const TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w700,
      color: FinStackColors.onSurface,
    ),
    labelLarge: const TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
      color: FinStackColors.onSurface,
    ),
    labelSmall: const TextStyle(
      fontSize: 10,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.1,
      color: FinStackColors.onSurfaceVariant,
    ),
    bodyMedium: const TextStyle(
      fontSize: 14,
      fontWeight: FontWeight.w500,
      color: FinStackColors.onSurface,
    ),
    bodySmall: const TextStyle(
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
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
      },
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      foregroundColor: FinStackColors.onSurface,
      toolbarHeight: 60,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Space Grotesk',
        fontSize: 18,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
        color: FinStackColors.onSurface,
      ),
      shape: Border(
        bottom: BorderSide(color: FinStackColors.onSurface, width: 3),
      ),
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      scrimColor: Color(0x8A1E1C10),
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
        borderSide: BorderSide(color: FinStackColors.onErrorContainer, width: 2),
      ),
      hintStyle: TextStyle(color: FinStackColors.onSurface.withValues(alpha: 0.5)),
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
        fontFamily: 'Space Grotesk',
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: FinStackColors.onSurface,
      ),
      contentTextStyle: TextStyle(
        fontFamily: 'Space Grotesk',
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: FinStackColors.onSurfaceVariant,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: Colors.white,
      modalBarrierColor: Color(0x991E1C10),
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
