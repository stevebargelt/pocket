import { Router } from "express";
import type { Db } from "./db";
import { generateText } from "./generator";
import { getHistory, saveSession } from "./sessions";
import { buildRecommendation } from "./recommender";
import { rebuildAggregatesFromKeystrokes } from "./aggregate";
import { getCorpus } from "./corpus";
import { rankWeakBigrams } from "./weakness";
import { generateLayerDrill } from "./drills/layerDrills";
import { generateThumbDrill } from "./drills/thumbDrills";
import type { Keymap } from "./keymap/types";
import {
  CONTEXTS,
  DEFAULT_CONTEXT,
  LAYOUT_FINGERPRINT,
  MAX_KEYSTROKE_LATENCY_MS,
  SESSION_MAX_DURATION_MS,
  TOP_N_WEAK,
  type Context,
} from "../shared/constants";
import type { PracticeMode, SessionPayload } from "../shared/types";

/**
 * The router's read-only view of the active ZMK keymap. Injected (not imported
 * directly off the holder) so the default — a no-keymap sentinel — keeps the
 * v1/v1.1 router tests fully isolated from the keymap subsystem: they neither
 * pick up a stray keymaps/ dir nor start a directory watcher. The server wires
 * the real holder-backed port in index.ts.
 */
export interface KeymapPort {
  getActiveKeymap(): Keymap | null;
  getActiveFingerprint(): string;
}

const SENTINEL_PORT: KeymapPort = {
  getActiveKeymap: () => null,
  getActiveFingerprint: () => LAYOUT_FINGERPRINT,
};

/** /text and /session are independent stateless calls; the read path coerces an
 *  unknown/missing context to the default so a bad query never yields empty text. */
function coerceContext(raw: unknown): Context {
  return CONTEXTS.includes(raw as Context) ? (raw as Context) : DEFAULT_CONTEXT;
}

const isNonNegativeInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;
const isPositiveInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

/**
 * Hand-rolled guard for the POST /session payload (house style — no zod for a
 * single route). Returns a human-readable error naming the FIRST offending
 * field, or null when the payload is acceptable. Rejects, never coerces.
 *
 * Threat model: the client is the only writer today, but a forged or buggy POST
 * is the realistic adversary — the keystrokes table is the source-of-truth for
 * every derived metric, so bad time fields skew WPM/longitudinal trends,
 * out-of-range latencies poison the per-key EMA, and unbounded char fields bloat
 * storage. Validate at the boundary (here), NOT in saveSession, which trusted
 * internal callers and the rebuild path reuse. Default-deny on the write path:
 * an unknown context is rejected (not coerced like the read path) so it can
 * never pollute history or the cross-context summary's GROUP BY.
 */
function validateSessionPayload(payload: SessionPayload): string | null {
  if (!payload || typeof payload !== "object") return "invalid session payload";

  // Session time fields (epoch ms). started_at:0 is a valid fixture, so the
  // floor is non-negative, not strictly positive.
  if (!isNonNegativeInt(payload.startedAt)) return "startedAt must be a non-negative integer";
  if (!isNonNegativeInt(payload.endedAt)) return "endedAt must be a non-negative integer";
  if (payload.endedAt < payload.startedAt) return "endedAt must be >= startedAt";
  if (payload.endedAt - payload.startedAt > SESSION_MAX_DURATION_MS) {
    return `session duration must be <= ${SESSION_MAX_DURATION_MS}ms (startedAt..endedAt)`;
  }

  // Target fields are optional on the wire (saveSession tolerates absence); when
  // present they must be sane positive integers.
  if (payload.targetSeconds !== undefined && !isPositiveInt(payload.targetSeconds)) {
    return "targetSeconds must be a positive integer";
  }
  if (payload.targetChars !== undefined && !isPositiveInt(payload.targetChars)) {
    return "targetChars must be a positive integer";
  }

  // Unknown context is rejected on the write path (CONTEXTS membership gate).
  if (payload.context !== undefined && !CONTEXTS.includes(payload.context)) {
    return "unknown context";
  }

  if (!Array.isArray(payload.keystrokes)) return "keystrokes must be an array";
  for (let i = 0; i < payload.keystrokes.length; i++) {
    const k = payload.keystrokes[i];
    if (!k || typeof k !== "object") return `keystrokes[${i}] must be an object`;
    if (
      typeof k.latencyMs !== "number" ||
      !Number.isFinite(k.latencyMs) ||
      k.latencyMs < 0 ||
      k.latencyMs > MAX_KEYSTROKE_LATENCY_MS
    ) {
      return `keystrokes[${i}].latencyMs must be a number in [0, ${MAX_KEYSTROKE_LATENCY_MS}]`;
    }
    if (typeof k.expectedChar !== "string" || k.expectedChar.length > 4) {
      return `keystrokes[${i}].expectedChar must be a string of length <= 4`;
    }
    if (typeof k.actualChar !== "string" || k.actualChar.length > 4) {
      return `keystrokes[${i}].actualChar must be a string of length <= 4`;
    }
    if (typeof k.correct !== "boolean") {
      return `keystrokes[${i}].correct must be a boolean`;
    }
  }

  return null;
}

export function createApiRouter(db: Db, keymap: KeymapPort = SENTINEL_PORT): Router {
  const router = Router();

  /** The ranked weak bigrams under the *active* fingerprint, for targeted drills. */
  const weakBigramUnits = (fp: string): string[] =>
    rankWeakBigrams(db, fp)
      .slice(0, TOP_N_WEAK)
      .map((w) => w.unit);

  router.get("/text", (req, res) => {
    const mode: PracticeMode = req.query.mode === "targeted" ? "targeted" : "random";
    const context = coerceContext(req.query.context);
    res.json(generateText(db, mode, undefined, keymap.getActiveFingerprint(), context));
  });

  router.post("/session", (req, res) => {
    const payload = req.body as SessionPayload;
    const error = validateSessionPayload(payload);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    // Stamp the session with the active layout fingerprint (sentinel when no
    // keymap is loaded) so every result is attributable to the exact layout.
    res.status(201).json(saveSession(db, payload, keymap.getActiveFingerprint()));
  });

  router.get("/history", (_req, res) => {
    res.json(getHistory(db));
  });

  router.get("/recommendation", (_req, res) => {
    res.json(buildRecommendation(db, keymap.getActiveFingerprint()));
  });

  router.post("/rebuild", (_req, res) => {
    rebuildAggregatesFromKeystrokes(db);
    res.json({ ok: true });
  });

  // --- v1.2: keymap awareness ---

  /** The parsed active keymap (layers + bindings), or null when none is loaded. */
  router.get("/keymap", (_req, res) => {
    res.json(keymap.getActiveKeymap());
  });

  /** Layer names + whether each binds enough typeable keys to drill. Empty when no keymap. */
  router.get("/layers", (_req, res) => {
    const km = keymap.getActiveKeymap();
    if (!km) {
      res.json([]);
      return;
    }
    const layers = km.layers.map((layer, index) => ({
      name: layer.name,
      index,
      // Authoritative drillability: ask the layer-drill generator itself, so this
      // flag can never disagree with what GET /drill?focus=layer will return.
      drillable: generateLayerDrill(km, layer.name).drillable,
    }));
    res.json(layers);
  });

  /**
   * Layer- or thumb-focused drill text (the existing GeneratedText shape, plus
   * drill metadata). `focus=layer` needs `layer=<name>`; `focus=thumb` optionally
   * takes `layer=<name>` (defaults to the base layer). The corpus + ranked weak
   * bigrams are fetched here and passed into the pure drill generators.
   */
  router.get("/drill", (req, res) => {
    const km = keymap.getActiveKeymap();
    if (!km) {
      res.status(404).json({ error: "no active keymap" });
      return;
    }
    const fp = keymap.getActiveFingerprint();
    const focus = req.query.focus;
    const layerName = typeof req.query.layer === "string" ? req.query.layer : undefined;

    if (focus === "thumb") {
      res.json(generateThumbDrill(km, layerName, { weakBigrams: weakBigramUnits(fp) }));
      return;
    }
    if (focus === "layer") {
      if (!layerName) {
        res.status(400).json({ error: "focus=layer requires a layer parameter" });
        return;
      }
      const context = coerceContext(req.query.context);
      const corpus = getCorpus(db, context).map((c) => c.text);
      res.json(generateLayerDrill(km, layerName, { corpus, weakBigrams: weakBigramUnits(fp) }));
      return;
    }
    res.status(400).json({ error: "drill requires focus=layer or focus=thumb" });
  });

  return router;
}
