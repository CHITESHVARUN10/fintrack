import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

class ApiClient {
  static final CookieJar _jar = CookieJar();
  static final Dio dio = Dio(BaseOptions(baseUrl: 'http://localhost:5000/api', connectTimeout: const Duration(seconds: 15)))..interceptors.add(CookieManager(_jar));
}
