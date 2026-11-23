import 'package:flutter/foundation.dart';
import 'package:home_widget/home_widget.dart';

import 'api_client.dart';
import 'format.dart';

/// Pushes the dashboard snapshot into the native home-screen widgets.
///
/// iOS reads the values from the shared App Group; Android reads the same keys
/// from the HomeWidget SharedPreferences through FinStackWidgetProvider.
class FinStackWidgetService {
  static const appGroupId = 'group.com.example.fintrackFlutter';
  static const iosWidgetName = 'FinStackWidget';
  static const androidWidgetName = 'FinStackWidgetProvider';

  static Future<void> configure() async {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      try {
        await HomeWidget.setAppGroupId(appGroupId);
      } catch (error) {
        debugPrint('FinStack widget group setup failed: $error');
      }
    }
  }

  static Future<void> refreshFromData(Map data) async {
    try {
      await configure();
      final now = DateTime.now();
      final income = (data['monthlyIncome'] as num?) ?? 0;
      final outflow = (data['monthlyObligations'] as num?) ?? 0;
      final saved = (data['netMonthlyFlow'] as num?) ?? 0;
      final hour = now.hour % 12 == 0 ? 12 : now.hour % 12;
      final minute = now.minute.toString().padLeft(2, '0');
      final stamp = '$hour:$minute ${now.hour >= 12 ? 'PM' : 'AM'}';
      await Future.wait([
        HomeWidget.saveWidgetData<String>(
          'finstack_month',
          monthYearLabel(now).toUpperCase(),
        ),
        HomeWidget.saveWidgetData<String>('finstack_income', inr(income)),
        HomeWidget.saveWidgetData<String>('finstack_outflow', inr(outflow)),
        HomeWidget.saveWidgetData<String>('finstack_saved', inr(saved)),
        HomeWidget.saveWidgetData<String>(
          'finstack_updated',
          'Updated $stamp',
        ),
      ]);
      await HomeWidget.updateWidget(
        iOSName: iosWidgetName,
        androidName: androidWidgetName,
      );
    } catch (error) {
      debugPrint('FinStack widget refresh failed: $error');
    }
  }

  static Future<void> refresh() async {
    try {
      final response = await ApiClient.dio.get<Map>('/dashboard');
      final data = response.data;
      if (data != null) await refreshFromData(data);
    } catch (error) {
      debugPrint('FinStack widget dashboard fetch failed: $error');
    }
  }
}
