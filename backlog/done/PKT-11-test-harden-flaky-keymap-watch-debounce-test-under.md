---
id: PKT-11
type: story
status: done
title: "test: harden flaky keymap-watch debounce test under concurrent load"
created: 2026-06-23
closed: 2026-06-23
---

test/keymap-watch.test.ts 'directory watcher debounces a rapid edit burst into a single reload' is timing-flaky: it passes reliably in isolation (3/3) but intermittently fails under the concurrent load of 'tsx --test test/*.test.ts', where the 400ms debounce window gets CPU-starved. Surfaced during the Node 24 / better-sqlite3 12.x upgrade (not caused by it).

Fix: make the assertion robust to scheduling jitter — wait on the reload signal with a generous deadline / assert reload-count after the debounce deterministically settles, rather than racing a fixed window. Must pass reliably under full-suite concurrency. test-engineer was asked to do this during the upgrade but did not action it.