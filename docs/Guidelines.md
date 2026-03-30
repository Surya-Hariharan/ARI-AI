# ARI Engineering Guidelines

## Repository hygiene

1. Do not commit test/demo scaffolding into production branches.
2. Keep cache and generated artifacts out of git: `__pycache__/`, `*.pyc`, and temporary `tmp/` binaries.
3. Keep Docker images runtime-only by removing test/spec/demo artifacts during image build.

## Backend quality rules

1. Add explicit timeouts to network calls and return structured error responses.
2. Prefer async/non-blocking execution for runtime actions.
3. Keep permission checks explicit for file, media, calendar, reminders, and app-launch actions.

## Voice pipeline rules

1. Preserve finite-state transitions; do not introduce implicit state booleans.
2. Keep confidence gating and low-confidence logging enabled.
3. Do not store raw audio in memory logs; only structured metadata and transcripts.

## Dependency rules

1. Every imported runtime package must exist in `requirements.txt`.
2. Avoid adding optional heavy dependencies unless used in a production path.
