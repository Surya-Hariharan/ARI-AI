package com.ari.assistant.runtime

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * ForegroundService skeleton for keeping the Voice Assistant alive
 * and managing long-running background mic permissions securely.
 */
class AriForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        // Initialize Notification channel for Foreground Service
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Start Hotword Listener and Voice Capture Pipeline
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null // Not bound, runs independently
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Cleanup resources
    }
}
