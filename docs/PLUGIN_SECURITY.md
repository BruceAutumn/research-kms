# Plugin security model

Research KMS v0.5.0 installs declarative JSON manifests from Settings. The server validates semantic version, SHA-256 digest, optional Ed25519 signature, HTTPS entry, exact domain allowlist and requested permissions before persisting a plugin.

Only four capability types are accepted: `http-tool`, `metadata-source`, `exporter` and `ui-link`. The host provides the actual operations and keeps account credentials and model keys on the server. A manifest never grants arbitrary code execution.

The first public release rejects remote JavaScript, `eval`, JAR/native modules, shell commands, direct SQL/database access, unrestricted filesystem access, non-HTTPS endpoints and undeclared domains. Installation and removal produce audit records. New permissions require a new manifest and user consent.

The canonical public schema is [`plugin-sdk/manifest.schema.json`](../plugin-sdk/manifest.schema.json).
