package com.ari.assistant.runtime

/**
 * Interface definition for handling hotword / wake-word triggers.
 * E.g., "Hey Ari".
 */
interface HotwordListener {
    fun onHotwordDetected(confidence: Float)
    fun onListeningTimeout()
    fun startListening()
    fun stopListening()
}

/**
 * Voice capture pipeline placeholder
 */
class VoiceCapturePipeline : HotwordListener {
    
    override fun onHotwordDetected(confidence: Float) {
        // Trigger generic Command dispatch client to Gateway
    }

    override fun onListeningTimeout() {
        // Reset state
    }

    override fun startListening() {
        // Initialize AudioRecord / Pocketsphinx / Porcupine
    }

    override fun stopListening() {
        // Release AudioRecord
    }
}
