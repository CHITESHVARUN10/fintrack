import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';

class AuthState {
  final bool loading;
  final Map<String, dynamic>? user;
  final String? error;
  const AuthState({this.loading = true, this.user, this.error});

  bool get isAuthenticated => user != null;
  bool get isAdmin => user?['role'] == 'admin';

  AuthState copyWith({bool? loading, Map<String, dynamic>? user, String? error, bool clearUser = false}) {
    return AuthState(
      loading: loading ?? this.loading,
      user: clearUser ? null : (user ?? this.user),
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  Future<void> checkSession() async {
    state = state.copyWith(loading: true);
    try {
      final res = await ApiClient.dio.get('/auth/me');
      final u = res.data['user'] ?? res.data;
      if (u != null && (u['_id'] != null || u['id'] != null)) {
        state = AuthState(loading: false, user: Map<String, dynamic>.from(u));
      } else {
        state = const AuthState(loading: false);
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        state = const AuthState(loading: false);
      } else {
        // Surface the real cause: timeout vs refused vs TLS helps
        // distinguish WiFi/firewall/ATS issues.
        final detail = e.message ?? e.type.name;
        state = AuthState(loading: false, error: 'Cannot reach server: ${ApiClient.baseUrl}\n($detail)');
      }
    } catch (_) {
      state = const AuthState(loading: false);
    }
  }

  String _msg(DioException e, String fallback) {
    final d = e.response?.data;
    if (d is Map && d['error'] != null) {
      final details = (d['details'] is List) ? ': ${(d['details'] as List).join(', ')}' : '';
      return '${d['error']}$details';
    }
    return fallback;
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(loading: true);
    try {
      final res = await ApiClient.dio.post('/auth/login', data: {'email': email.trim(), 'password': password});
      final u = res.data['user'] ?? res.data;
      state = AuthState(loading: false, user: Map<String, dynamic>.from(u));
    } on DioException catch (e) {
      state = AuthState(loading: false, error: _msg(e, 'Login failed. Please try again.'));
      rethrow;
    }
  }

  Future<void> register(String name, String email, String password) async {
    state = state.copyWith(loading: true);
    try {
      await ApiClient.dio.post('/auth/register', data: {'name': name.trim(), 'email': email.trim(), 'password': password});
      // Website auto-logins after register (AuthContext.register -> login)
      final res = await ApiClient.dio.post('/auth/login', data: {'email': email.trim(), 'password': password});
      final u = res.data['user'] ?? res.data;
      state = AuthState(loading: false, user: Map<String, dynamic>.from(u));
    } on DioException catch (e) {
      state = AuthState(loading: false, error: _msg(e, 'Registration failed.'));
      rethrow;
    }
  }

  Future<void> logout() async {
    try {
      await ApiClient.dio.post('/auth/logout');
    } catch (_) {}
    state = const AuthState(loading: false);
  }

  void clearError() => state = state.copyWith(error: null);
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier());
