# Security Policy

At **ARI (Autonomous Reasoning Interface)**, user privacy and system security are fundamental design principles. Because ARI interacts with live microphones, speaker voice profiles, biometric hardware, and agentic compute environments, we treat security vulnerabilities with the highest priority.

---

## Supported Versions

Security patches and updates are actively maintained on the following branches:

| Version / Branch | Supported          | Status             |
| ---------------- | ------------------ | ------------------ |
| `main`           | :white_check_mark: | Actively supported |
| `< 1.0.0` (Dev)  | :white_check_mark: | Latest commit only |

Please ensure you are testing against or running the latest commit on `main` before submitting security reports.

---

## Reporting a Vulnerability

We appreciate the efforts of security researchers and community members who practice responsible disclosure.

### How to Report
If you believe you have discovered a vulnerability, security flaw, or privacy leak in ARI:

1. **Do NOT open a public issue, discussion, or pull request.**
2. Send an email to the project maintainers with the subject line:
   `[SECURITY] ARI Vulnerability Report - <Brief Summary>`
   - Primary Security Contact: Maintainer / Project Lead via GitHub Profile or email associated with this repository.
   - Alternatively, use **GitHub Private Vulnerability Reporting** via the repository's **Security** tab if enabled.

### What to Include in Your Report
To help us triage and resolve the issue quickly, please include:
- **Component**: Affected module (e.g. Android client, server bridge, wake-word engine, authentication flow).
- **Type of Issue**: (e.g. Insecure data storage, bypass of biometric lock, privilege escalation, unauthenticated remote access, memory leak).
- **Steps to Reproduce**: Detailed, step-by-step instructions or proof-of-concept (PoC) code/scripts.
- **Impact Assessment**: What an attacker could achieve, what user data could be compromised, and prerequisites for exploitation.
- **Affected Environment**: Device hardware, Android OS version, backend Python version, and network setup.

### Response Timelines
- **Initial Acknowledgment**: Within **48 hours** of report receipt.
- **Assessment & Triage**: Within **5 business days** confirming vulnerability status and severity.
- **Fix & Patch Deployment**: We aim to resolve critical issues within **14 business days** and issue a security advisory once a patched release is deployed.
- **Coordinated Disclosure**: We request that you maintain confidentiality until a fix has been verified and released to protect all active users.

---

## Security Architecture & Best Practices

### 1. Local-First & Privacy Preservation
- **Voice Enrollment Data**: Speaker verification profiles and audio embeddings must never be transmitted unencrypted or exported to third-party tracking services.
- **Microphone Access**: Continuous listening operates solely for wake-phrase detection using on-device models. Audio buffers are discarded immediately unless actively executing an authorized command.

### 2. Secrets & Credential Management
- **Environment Separation**: API keys, server tokens, and credentials must reside exclusively in `.env` (which is git-ignored).
- **Template Hygiene**: `.env.template` must only contain dummy placeholder values.
- **No Hardcoded Keys**: Commits containing hardcoded private tokens, passwords, or cloud credentials will be rejected and purged immediately.

### 3. Android Client Security
- **Biometric & Credential Protection**: Phone Screen Lock uses Android `KeyguardManager` and `BiometricPrompt` backed by the device's hardware Secure Element / TEE (Trusted Execution Environment).
- **Network Security Configuration**: Cleartext HTTP traffic is disabled by default in production builds. All client-to-server communication should utilize TLS 1.3 / WSS.
- **App Sandboxing**: Internal databases, token caches, and user profiles are stored in private internal application storage (`Context.MODE_PRIVATE`).

### 4. Agentic Execution Guardrails
- **Tool Confirmation**: Autonomous actions involving file destruction, sensitive system modification, or network requests must prompt for user verification when restricted permissions are enabled.
- **Sandbox Isolation**: Background sub-processes executed by the server must be strictly constrained to authorized working directories.

---

## Hall of Fame & Acknowledgments

We value and publicly credit researchers and contributors who discover security flaws and practice responsible disclosure in accordance with this policy.
