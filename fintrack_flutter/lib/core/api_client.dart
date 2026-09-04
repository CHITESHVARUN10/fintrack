import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const _baseUrlKey = 'fintrack_base_url';
  static const defaultBaseUrl = 'http://192.168.1.213:3000/api';
  static const _storage = FlutterSecureStorage();

  static final CookieJar _jar = CookieJar();
  static final Dio dio = Dio(BaseOptions(
    baseUrl: defaultBaseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
  ))
    ..interceptors.add(CookieManager(_jar));

  /// Load persisted server URL (for physical iPhone localhost != Mac).
  /// Call once at startup before first /auth/me check.
  /// Auto-migrates old :5000 URLs to :3000.
  static Future<String> init() async {
    try {
      final saved = await _storage.read(key: _baseUrlKey);
      if (saved != null && saved.trim().isNotEmpty) {
        var url = saved.trim();
        // Migrate backend move 5000 -> 3000
        if (url.contains(':5000')) {
          url = url.replaceAll(':5000', ':3000');
          await _storage.write(key: _baseUrlKey, value: url);
        }
        // Migrate stale Mac IP after WiFi change (.136 no longer exists)
        if (url.contains('192.168.1.136')) {
          url = url.replaceAll('192.168.1.136', '192.168.1.213');
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
