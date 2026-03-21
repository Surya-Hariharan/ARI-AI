# Mobile Overlay Lifecycle

The Android client utilizes a Window Manager overlay to provide persistent visual feedback during execution.

1. **Initialization**: Foreground service requests SYSTEM_ALERT_WINDOW.
2. **Listening State**: Animated glowing orb floats on edge of screen.
3. **Execution State**: Orb expands into a pill-shaped indicator showing current step progress.
4. **Completion**: Shrinks back to hidden state or shows success checkmark briefly.
