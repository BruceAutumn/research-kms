# Public release readiness

## Supported release channels

| Channel | Status | Security boundary |
| --- | --- | --- |
| Hosted Web (`website/`) | Public beta | SIWC identity, user-scoped D1/R2 records, encrypted BYOK, quotas and audit events |
| Windows | Installable MSI/NSIS | HTTPS-hosted workspace; unsigned publisher warning is expected |
| Android | Signed side-load APK | HTTPS-hosted workspace; Play Store AAB review is outside this release |
| Spring + React reference app | Private/local | Do not expose the single-user deployment directly to the public Internet |

## Implemented controls

- User-scoped papers, notes, annotations, conversations, Agent runs, plugins and object access.
- One identity-portal login action, session revocation request, export, account deletion and API-key replacement/deletion.
- Same-origin mutation checks, sanitized request-ID errors, upload/AI/Agent quotas, encrypted model keys and R2 cleanup on failed writes.
- Versioned paper/note/annotation writes with `409` conflicts, stable note IDs, FTS5 search and Range-aware PDF delivery.
- Declarative plugin kinds, HTTPS/domain allowlists, permission display, optional digest and Ed25519 verification; arbitrary JavaScript/JAR/Shell loading is rejected.
- Stepwise Agent persistence, registered-tool discovery, approval gates, cancellation checks and recoverable runs.

## Distribution notes

- Windows Authenticode signing requires a publisher certificate and is intentionally not claimed.
- Android Play distribution additionally requires an AAB, Play App Signing and store Data Safety review.
- Operators remain responsible for alerting, encrypted backup/restore drills, retention policy and jurisdiction-specific legal review.
