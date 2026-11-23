package com.example.fintrack_flutter

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetProvider

class FinStackWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        appWidgetIds.forEach { appWidgetId ->
            val views = RemoteViews(context.packageName, R.layout.finstack_widget).apply {
                setTextViewText(
                    R.id.widget_month,
                    widgetData.getString("finstack_month", "THIS MONTH"),
                )
                setTextViewText(
                    R.id.widget_income,
                    widgetData.getString("finstack_income", "—"),
                )
                setTextViewText(
                    R.id.widget_outflow,
                    widgetData.getString("finstack_outflow", "—"),
                )
                setTextViewText(
                    R.id.widget_saved,
                    widgetData.getString("finstack_saved", "—"),
                )
                setTextViewText(
                    R.id.widget_updated,
                    widgetData.getString("finstack_updated", "Open FinStack to sync"),
                )
                val launch = Intent(context, MainActivity::class.java)
                val pending = PendingIntent.getActivity(
                    context,
                    0,
                    launch,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                setOnClickPendingIntent(R.id.widget_root, pending)
            }
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
