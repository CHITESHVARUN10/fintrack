import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _storageKey = 'finstack_theme_mode';
const _storage = FlutterSecureStorage();

Future<ThemeMode> loadThemeMode() async {
  try {
    final value = await _storage.read(key: _storageKey);
    return switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  } catch (_) {
    return ThemeMode.system;
  }
}

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController(super.state);

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.write(key: _storageKey, value: mode.name);
    } catch (_) {
      // The in-memory choice still applies for this session.
    }
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(ThemeMode.system),
);
