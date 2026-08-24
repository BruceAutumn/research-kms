# Plugin security model

The current Plugins page is a capability catalogue, not a dynamic package loader. That is intentional: loading arbitrary JavaScript, native libraries or JAR files would give an untrusted plugin the same access as the application.

## Proposed public contract

Plugins should be declarative manifests that request narrow host-provided operations. A manifest declares:

- stable identifier, publisher, version and compatible host range;
- entry type (`http-tool`, `metadata-source`, `exporter` or `ui-link`), never an arbitrary local executable;
- requested permissions such as `papers:read`, `metadata:write`, `vault:read`, `network:crossref.org`;
- exact outbound domains, input/output JSON Schema and privacy disclosures;
- package digest and publisher signature.

The host must show a human-readable consent screen, deny undeclared calls, keep API keys on the server side, impose time/budget limits and write an audit event. Permission changes require renewed consent. A revocation list must be checked before loading.

## Non-goals for the first public release

- no `eval`, remote script tags, shell commands or unrestricted filesystem access;
- no plugin-supplied SQL, Spring beans or native modules;
- no access to another user's workspace or model key;
- no silent background execution or permission expansion.

`plugin-sdk/manifest.schema.json` is the reviewable starting point. It is not yet a promise that third-party code executes in production.
