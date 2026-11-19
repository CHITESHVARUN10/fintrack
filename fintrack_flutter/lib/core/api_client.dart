import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

class ApiClient {
  static const _baseUrlKey = 'fintrack_base_url';
  static const defaultBaseUrl = 'https://fintrack-viqo.onrender.com/api';
  static const _storage = FlutterSecureStorage();

  static late CookieJar _jar;
  static bool _cookiesReady = false;

  static final Dio dio = Dio(
    BaseOptions(
      baseUrl: defaultBaseUrl,
      // Generous timeouts: Render free tier cold-starts can take ~30-60s.
      connectTimeout: const Duration(seconds: 45),
      receiveTimeout: const Duration(seconds: 45),
    ),
  );

  /// Load the persisted server URL and the on-disk cookie jar.
  /// Call once at startup before the first /auth/me check.
  ///
  /// The session cookie is what "remembers me": an in-memory jar meant every
  /// cold start looked like a fresh login.
  static Future<String> init() async {
    await _initCookies();
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

  static Future<void> _initCookies() async {
    if (_cookiesReady) return;
    _cookiesReady = true;
    try {
      final dir = await getApplicationSupportDirectory();
      _jar = PersistCookieJar(
        ignoreExpires: false,
        storage: FileStorage('${dir.path}/fintrack_cookies'),
      );
    } catch (_) {
      _jar = CookieJar();
    }
    dio.interceptors.add(CookieManager(_jar));
  }

  static Future<void> clearCookies() async {
    try {
      await _jar.deleteAll();
    } catch (_) {}
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
