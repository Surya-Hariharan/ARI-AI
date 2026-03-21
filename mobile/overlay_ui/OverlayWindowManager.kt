package com.ari.overlay

import android.content.Context
import android.view.WindowManager

/**
 * Floating overlay WindowManager scaffold.
 * Displays the dynamic orb or listening state over other apps.
 */
class OverlayWindowManager(private val context: Context) {
    private var windowManager: WindowManager? = null

    init {
        windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    fun showListeningState() {
        // Render glowing Orb placeholder
    }

    fun updateExecutionFeedback(status: String) {
        // Render execution feedback placeholder
    }

    fun hideOverlay() {
        // Remove view from WindowManager
    }
}
