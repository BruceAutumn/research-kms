# Public release readiness

This file separates features that work for a **local single-user installation** from controls required for a **public multi-user service**. A green local build is not evidence that the backend is safe to expose to the Internet.

## Release channels

| Channel | Current status | Safe use |
| --- | --- | --- |
| Hosted Web product (`website/`) | Ready for public beta | SIWC identity, D1 tenant data, R2 files and encrypted BYOK |
| Local web / PWA (`frontend/` + `backend/`) | Ready for local use | One trusted user on a private machine/network |
| Windows shell | CI-built installer | Connects only to the configured HTTPS Web product |
| Android shell | Signed APK for direct install | Play Store release still needs AAB and Data safety review |
| Local Spring backend as public SaaS | **Blocked** | Keep `APP_DEPLOYMENT_MODE` private/local |

The local Spring backend deliberately refuses to start in `public` mode. The hosted `website/` uses a separate tenant-aware architecture; do not remove the local-backend guard without completing its own P0 controls.

## P0 — blocks a public account service

- [ ] Identity: verified email, secure password reset, optional MFA/passkeys, login throttling, breached-password checks, session/device revocation and re-authentication for sensitive actions.
- [ ] OAuth/OIDC: Authorization Code + PKCE, exact redirect URI matching, state/nonce validation and protected refresh-token rotation. Do not use the implicit flow.
- [ ] Tenant authorization: add `user_id` or `workspace_id` to papers, annotations, collections, conversations, messages, agents, workflows, runs, notes, provider/model settings and audit records. Every repository query and file access must be tenant-scoped.
- [ ] Tenant storage: separate PDF, Vault and temporary attachment namespaces; deny path traversal and cross-tenant object identifiers; delete temporary uploads after the request/run lifecycle.
- [ ] BYOK: encrypt each user's API key with an envelope-encryption/KMS design, never return a saved key, redact logs/errors, support rotation/deletion and prevent keys from entering client bundles.
- [ ] Object/function authorization tests: prove user A cannot enumerate, read, mutate, stream or delete user B's IDs, files, runs or model settings.
- [ ] Abuse controls: per-account/IP login limits, API quotas, upload/LLM/tool budgets, concurrency caps, timeouts and bounded queues.
- [ ] Account lifecycle: export, delete, retention window, deletion propagation, consent/version records and support contact.
- [ ] Browser security: HTTPS-only, HSTS at the edge, Secure/HttpOnly/SameSite cookies, CSRF defence, strict CORS allowlist, CSP and safe redirect handling.
- [ ] Upload pipeline: allowlist + file signatures, decompression/page/text limits, isolated parsing, malware scanning/quarantine and safe download headers.

## P1 — required before general availability

- [ ] Signed Windows installers and signed mandatory updater manifests; protected signing credentials and rollback plan.
- [ ] Signed Android App Bundle, Play App Signing/upload key, target SDK compliance, privacy policy and accurate Data safety form.
- [ ] Plugin model: declarative manifests, explicit permissions, signatures, compatibility checks, sandboxed execution, domain allowlists, revocation and audit events. No arbitrary JavaScript/JAR loading.
- [ ] Observability: structured redacted logs, metrics, distributed traces, alerting, SLOs, security/audit events and user-visible status page.
- [ ] Operations: encrypted backups, restore drills, database migrations/rollback, disaster recovery, dependency updates, SBOM and secret scanning over full Git history.
- [ ] Accessibility: keyboard-only operation, visible/unobscured focus, logical focus order, labels, contrast, reduced motion and screen-reader regression checks.
- [ ] Legal/support: Terms, Privacy Policy, acceptable-use rules, third-party model disclosures, copyright/takedown path and security vulnerability contact.

## P2 — quality and scale

- [ ] Route-level code splitting for the PDF reader, editor and graph chunks.
- [ ] Offline-first sync with documented conflict resolution, encryption and recovery.
- [ ] Plugin marketplace moderation, publisher verification and transparent permissions.
- [ ] Full Zotero/EndNote interoperability matrix and Obsidian-compatible import/export fixtures.

## Evidence already present

- API security response headers and a hard public-deployment guard.
- PDF magic-byte, size, page and extracted-text limits with cleanup on failure.
- Vault attachment allowlist and safer inline/download behavior.
- Opaque AI attachment tokens rather than absolute server paths.
- PWA manifest/service worker, install affordance and native wrapper configuration with minimum Tauri capabilities.
- CI gates for Maven tests, TypeScript/production build, Windows source build and Android source build.

## External credentials deliberately not included

The public repository must not contain a domain registrar login, database password, model key, email/SMS provider key, OAuth client secret, Windows certificate, Android keystore, GitHub token or production encryption key. Those belong in a managed secret store and must be rotated if ever committed.
