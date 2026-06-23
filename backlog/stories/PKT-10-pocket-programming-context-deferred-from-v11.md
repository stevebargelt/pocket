---
id: PKT-10
type: story
status: active
title: Pocket — programming context (deferred from v1.1)
---

v1.1 originally scoped 5 contexts (prompts + CLI + code + email + Teams) but user opted to defer programming. Add as a follow-on pipeline run after v1.1 and v1.2 ship.

Open design decision when this runs:
- Per-language context values (typescript / python / bash as distinct contexts, UI groups them) vs flat 'code' bucket. Architect recommended per-language for v1.1; revisit then.

Corpus considerations:
- Use permissive-license sources only (Express, FastAPI, etc.). Avoid The Stack at runtime.
- Per-language line cap (~120 chars for code vs 200 for prose).
- Curate-script analogous to scripts/curate-corpus.ts.

This is NOT a v1.x hardening item — it's a real feature, just deferred.