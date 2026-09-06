import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const _baseUrlKey = 'fintrack_base_url';
  static const defaultBaseUrl = 'https://fintrack-viqo.onrender.com/api';
  static const _storage = FlutterSecureStorage();

  static final CookieJar _jar = CookieJar();
  static final Dio dio = Dio(BaseOptions(
    baseUrl: defaultBaseUrl,
    // Generous timeouts: Render free tier cold-starts can take ~30-60s.
    connectTimeout: const Duration(seconds: 45),
    receiveTimeout: const Duration(seconds: 45),
  ))
    ..interceptors.add(CookieManager(_jar));

  /// Load persisted server URL (Settings screen override).
  /// Call once at startup before first /auth/me check.
  /// One-time migration: old local/LAN URLs move to the hosted backend.
  static Future<String> init() async {
    try {
      final saved = await _storage.read(key: _baseUrlKey);
      if (saved != null && saved.trim().isNotEmpty) {
        var url = saved.trim();
        // Migrate local/LAN dev URLs to the hosted backend
        if (url.contains('localhost') ||
            url.contains('127.0.0.1') ||
            url.contains('192.168.') ||
            url.contains('10.0.') ||
            url.contains(':5000') ||
            url.contains(':3000')) {
          url = defaultBaseUrl;
          await _storage.write(key: _baseUrlKey, value: url);
        }
        // Ensure /api suffix (old default missed it)
        if (!url.endsWith('/api')) {
          url = '${url.replaceAll(RegExp(r'/+$'), '')}/api';
          await _storage.write(key: _baseUrlKey, value: url);
        }
        dio.options.baseUrl = url;
      }
    } catch (_) {}
    return dio.options.baseUrl;
  }

  static Future<void> setBaseUrl(String url) async {
    final clean = url.trim().replaceAll(RegExp(r'/+$'), '');
    dio.options.baseUrl = clean;
    try {
      await _storage.write(key: _baseUrlKey, value: clean);
    } catch (_) {}
  }

  static String get baseUrl => dio.options.baseUrl;
}
