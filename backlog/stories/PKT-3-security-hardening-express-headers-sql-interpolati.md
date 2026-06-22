---
id: PKT-3
type: story
status: active
title: "Security hardening: Express headers + SQL interpolation review"
---

Surfaced by red-security on Pocket v1 build. All low-severity for a localhost-only single-user app; revisit if Pocket ever gets a networked deployment:

1. Missing Express security headers. Add helmet middleware (CSP, X-Frame-Options, etc.).
2. SQL PRAGMA statement uses string interpolation. Argument is a known constant (user_version), not user input — safe but cleaner with a constant binding.
3. Dynamic SQL table/column names in weakness.ts and aggregate.ts use string interpolation. Verify all interpolated names come from internal constants (LAYOUT_FINGERPRINT etc.), not user input. If safe, document; if not, use safer construction.

Source: red-security verdict on Pocket v1 build (task-build-4c7211).