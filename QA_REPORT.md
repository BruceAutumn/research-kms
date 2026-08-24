# Research KMS v0.5.0 public QA summary

Release date: 2026-08-24  
Reference source commit: `682c181ce2dff09f2d344bbe3de4f56e8d1233b9`

## Automated evidence

- Hosted Web: TypeScript and production build passed; 8/8 workspace regression tests passed.
- Spring reference backend: 75/75 Maven tests passed.
- React reference client: TypeScript and production build passed; the editor engine is route-split and no JavaScript business chunk exceeds 500 kB.
- Public source: secret-pattern, private-path and packaged-content checks are release gates.

## Browser evidence

The public homepage, login entry and workspace recovery controls were checked at 1440×900, 1024×768, 768×1024 and 390×844. Page scrolling remains available, mobile navigation and side panes remain recoverable, and the login page exposes one truthful identity-portal action.

## Release notes

- The Windows MSI/NSIS installers are reproducible but are not Authenticode-signed.
- The Android APK is release-keystore signed; signing material is excluded from this repository.
- Deterministic Agent tests may use a mock model. A configured provider is still required for real model responses.
