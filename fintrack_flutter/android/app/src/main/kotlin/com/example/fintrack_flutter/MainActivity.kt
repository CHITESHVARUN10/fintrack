package com.example.fintrack_flutter

import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import io.flutter.FlutterInjector
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var feedbackChannel: MethodChannel? = null
    private var soundPool: SoundPool? = null
    private var paymentSound = 0

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val audio = getSystemService(AudioManager::class.java)
        val pool = SoundPool.Builder()
            .setMaxStreams(1)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .build()
        soundPool = pool
        pool.setOnLoadCompleteListener { _, sound, status ->
            if (status == 0) paymentSound = sound
        }
        val asset = FlutterInjector.instance().flutterLoader()
            .getLookupKeyForAsset("assets/audio/payment_success.wav")
        runCatching { assets.openFd(asset).use { pool.load(it, 1) } }

        feedbackChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "finstack/payment_feedback"
        ).also { channel ->
            channel.setMethodCallHandler { call, result ->
                if (call.method == "playSuccess") {
                    if (paymentSound != 0 && audio?.ringerMode == AudioManager.RINGER_MODE_NORMAL) {
                        pool.play(paymentSound, 1f, 1f, 1, 0, 1f)
                    }
                    result.success(null)
                } else {
                    result.notImplemented()
                }
            }
        }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        feedbackChannel?.setMethodCallHandler(null)
        feedbackChannel = null
        soundPool?.release()
        soundPool = null
        paymentSound = 0
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
