import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FinStackColors {
  static const onSurface = Color(0xFF1E1C10);
  static const brandYellow = Color(0xFFFFE500);
  static const onSurfaceVariant = Color(0xFF4B4731);
  static const surfaceLow = Color(0xFFFAF3DF);
  static const surfaceContainer = Color(0xFFF4EEDA);
  static const surfaceHigh = Color(0xFFEEE8D4);
  static const tertiary = Color(0xFF00FCFB);
  static const onTertiaryContainer = Color(0xFF007171);
  static const errorContainer = Color(0xFFFFDAD6);
  static const onErrorContainer = Color(0xFF93000A);
  static const outlineVariant = Color(0xFFCEC7AA);
}

BoxDecoration brutal({Color color = Colors.white, double border = 4, double shadow = 4}) =>
    BoxDecoration(color: color, border: Border.all(color: FinStackColors.onSurface, width: border), boxShadow: [BoxShadow(color: FinStackColors.onSurface, offset: Offset(shadow, shadow))]);

ThemeData finStackTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: Colors.white,
    colorScheme: const ColorScheme.light(primary: FinStackColors.onSurface, onPrimary: Colors.white, secondary: FinStackColors.tertiary, onSecondary: FinStackColors.onSurface, surface: Colors.white, onSurface: FinStackColors.onSurface, error: FinStackColors.errorContainer, onError: FinStackColors.onErrorContainer),
    textTheme: GoogleFonts.spaceGroteskTextTheme().copyWith(
      displayLarge: const TextStyle(fontSize: 48, fontWeight: FontWeight.w700, height: 0.95, letterSpacing: -1.2, color: FinStackColors.onSurface),
      headlineLarge: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -0.5, color: FinStackColors.onSurface),
      titleLarge: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: FinStackColors.onSurface),
      labelSmall: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: FinStackColors.onSurface),
      bodyMedium: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: FinStackColors.onSurface),
    ),
    appBarTheme: const AppBarTheme(backgroundColor: Colors.white, elevation: 0, surfaceTintColor: Colors.transparent, foregroundColor: FinStackColors.onSurface, shape: Border(bottom: BorderSide(color: FinStackColors.onSurface, width: 3))),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(backgroundColor: FinStackColors.brandYellow, foregroundColor: FinStackColors.onSurface, side: const BorderSide(color: FinStackColors.onSurface, width: 2), elevation: 2, shadowColor: FinStackColors.onSurface, shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero), textStyle: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.8), padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12))),
    inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: Colors.white, border: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: FinStackColors.onSurface, width: 2)), focusedBorder: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: FinStackColors.onSurface, width: 2)), hintStyle: TextStyle(color: FinStackColors.onSurface.withOpacity(0.6)), contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
    dividerTheme: const DividerThemeData(color: FinStackColors.onSurface, thickness: 3, space: 1),
    cardTheme: const CardThemeData(color: Colors.white, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.zero, side: BorderSide(color: FinStackColors.onSurface, width: 4))),
  );
}
