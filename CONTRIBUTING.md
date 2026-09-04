# Contributing to ARI

Thank you for your interest in contributing to **ARI (Autonomous Reasoning Interface)**! We welcome contributions from developers, researchers, and designers to help build a privacy-first, low-latency, and agentic AI voice assistant.

Please take a moment to review these guidelines before submitting code, issues, or pull requests.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites & Development Setup](#prerequisites--development-setup)
4. [Branching & Commit Guidelines](#branching--commit-guidelines)
5. [Coding Standards](#coding-standards)
   - [Android / Kotlin (Frontend)](#android--kotlin-frontend)
   - [Python / Core Engine (Backend)](#python--core-engine-backend)
6. [Testing & Quality Assurance](#testing--quality-assurance)
7. [Submitting a Pull Request](#submitting-a-pull-request)
8. [Reporting Issues & Bugs](#reporting-issues--bugs)

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone.
- Be respectful, constructive, and collaborative.
- Respect user privacy and security above all else. ARI handles sensitive personal voice data and system capabilities.
- Zero tolerance for harassment, derogatory language, or personal attacks.

---

## Architecture Overview

ARI consists of two primary layers:

1. **Frontend (`/frontend`)**:
   - Native Android application built with **Kotlin** and **Jetpack Compose**.
   - Implements Apple Human Interface Guidelines (HIG) aesthetics with a custom design system (`ARITheme`, liquid glass floating navigation capsule, Inset Grouped cards, and refined typography).
   - State management powered by Kotlin Coroutines, `StateFlow`, and repository patterns.
   - Interacts with device hardware: Biometrics, microphone audio input, and network pairing.

2. **Backend (`/backend`)**:
   - Python-based server and agentic reasoning platform.
   - Low-latency wake-phrase detection and speaker verification.
   - Streaming LLM inference, tool execution, and local hardware orchestration.

---

## Prerequisites & Development Setup

### System Requirements
- **JDK**: Java 17 or higher
- **Android Studio**: Ladybug / Hedgehog or newer (with Android SDK 34 / 35 installed)
- **Python**: Python 3.10+ (for backend development)
- **Git**: Git 2.30+
- **Physical or Virtual Android Device**: Android 10+ (API 29+) recommended for testing audio, wake words, and biometric authentication.

### Local Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Surya-Hariharan/ARI-AI.git
   cd ARI-AI
   ```

2. **Environment Configuration**:
   - Copy the sanitized template:
     ```bash
     cp .env.template .env
     ```
   - Populate local connection URLs, API keys, and device pairing tokens in `.env`.
   - **Never commit `.env` or sensitive API tokens to git.**

3. **Building the Android Frontend**:
   ```bash
   cd frontend
   ./gradlew assembleDebug
   ```

4. **Deploying to Device via ADB**:
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

---

## Branching & Commit Guidelines

### Branch Naming Conventions
- Features: `feat/short-description` (e.g. `feat/audio-visualizer-cache`)
- Bug Fixes: `fix/short-description` (e.g. `fix/control-sheet-height`)
- Performance: `perf/short-description` (e.g. `perf/draw-with-cache-optimizations`)
- Documentation: `docs/short-description` (e.g. `docs/add-contributing-guide`)
- Maintenance: `chore/short-description` (e.g. `chore/bump-gradle-dependencies`)

### Commit Messages
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

**Allowed Types:**
- `feat`: A new feature or user-facing capability
- `fix`: A bug fix
- `perf`: Performance improvement or frame-rate optimization
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `docs`: Documentation changes only
- `style`: Changes that do not affect the meaning of the code (white-space, formatting)
- `test`: Adding missing tests or correcting existing tests
- `chore`: Build tasks, repository maintenance, dependencies

*Example:* `perf(assistant): optimize voice visualizer shaders with drawWithCache`

---

## Coding Standards

### Android / Kotlin (Frontend)
- **Jetpack Compose Performance**:
  - Never allocate heap objects (`Brush`, `Path`, `Rect`, `CornerRadius`, `Stroke`) inside continuous draw or composition loops.
  - Use `Modifier.drawWithCache` for complex canvas geometry and vector drawings.
  - Wrap brushes and static calculations in `remember` or `remember(key)`.
  - Isolate animation matrices inside `Modifier.graphicsLayer` to execute directly on the GPU `RenderThread` without triggering recomposition passes.
- **Design System Fidelity**:
  - Adhere strictly to the Apple HIG typography tokens defined in `AppleTypography` and palette tokens in `ARITheme.colors`.
  - Modal sheets should follow standard half-screen detents (`fillMaxHeight(0.50f)`) or full-height inset groups where appropriate.
  - Use tactile haptic feedback (`HapticFeedbackType.LongPress` or `TextHandleMove`) for interactive switches and buttons.
- **Null Safety & Architecture**:
  - Leverage Kotlin coroutines and structured concurrency.
  - Never run blocking operations or disk/network I/O on the main thread.

### Python / Core Engine (Backend)
- Follow **PEP 8** style conventions.
- Use explicit type annotations for function parameters and return values.
- Async I/O: Use `asyncio` for non-blocking network, streaming audio, and LLM processing.
- Clean separation of concerns: Decouple audio capture, audio analysis, model inference, and tool execution.

---

## Testing & Quality Assurance

Before submitting changes, ensure everything builds cleanly and passes all checks:

1. **Android Build & Lint Verification**:
   ```bash
   cd frontend
   ./gradlew check
   ./gradlew assembleDebug
   ```
2. **Device Smoke Test**:
   - Verify UI rendering across dark and light modes.
   - Verify 60/120 FPS smoothness on physical devices using Android GPU profiling or Choreographer logs.
   - Verify navigation transitions, bottom sheets, and permission dialogs.

---

## Submitting a Pull Request

1. Push your branch to your fork or upstream repository.
2. Open a Pull Request targeting `main`.
3. Provide a clear and descriptive PR title adhering to Conventional Commits.
4. Fill out the PR description:
   - **What changed?** Summary of code and UX modifications.
   - **Why?** Motivation, context, or issue being resolved.
   - **Verification:** Screenshots, video recordings (for UI changes), and automated test results.
5. Ensure CI builds pass without warnings or errors.
6. Address review comments promptly.

---

## Reporting Issues & Bugs

If you discover a bug or encounter unexpected behavior:
- Check existing issues to avoid duplicates.
- Open a GitHub Issue using the bug report template.
- Include:
  - Exact reproduction steps.
  - Android OS version, device model, and backend environment.
  - Expected behavior vs. actual behavior.
  - Relevant logcat or console output.

For security-sensitive issues, please refer to our [Security Policy](SECURITY.md).
