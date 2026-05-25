import { Router } from "express";
import type { Db } from "./db";
import { generateText } from "./generator";
import { getHistory, saveSession } from "./sessions";
import { buildRecommendation } from "./recommender";
import { rebuildAggregatesFromKeystrokes } from "./aggregate";
import { CONTEXTS, DEFAULT_CONTEXT, type Context } from "../shared/constants";
import type { PracticeMode, SessionPayload } from "../shared/types";

/** /text and /session are independent stateless calls; the read path coerces an
 *  unknown/missing context to the default so a bad query never yields empty text. */
function coerceContext(raw: unknown): Context {
  return CONTEXTS.includes(raw as Context) ? (raw as Context) : DEFAULT_CONTEXT;
}

export function createApiRouter(db: Db): Router {
  const router = Router();

  router.get("/text", (req, res) => {
    const mode: PracticeMode = req.query.mode === "targeted" ? "targeted" : "random";
    const context = coerceContext(req.query.context);
    res.json(generateText(db, mode, undefined, undefined, context));
  });

  router.post("/session", (req, res) => {
    const payload = req.body as SessionPayload;
    if (!payload || !Array.isArray(payload.keystrokes) || typeof payload.startedAt !== "number") {
      res.status(400).json({ error: "invalid session payload" });
      return;
    }
    // Write path is strict: an unknown context would pollute history and the
    // cross-context summary's GROUP BY, so reject it rather than coerce.
    if (payload.context !== undefined && !CONTEXTS.includes(payload.context)) {
      res.status(400).json({ error: "unknown context" });
      return;
    }
    res.status(201).json(saveSession(db, payload));
  });

  router.get("/history", (_req, res) => {
    res.json(getHistory(db));
  });

  router.get("/recommendation", (_req, res) => {
    res.json(buildRecommendation(db));
  });

  router.post("/rebuild", (_req, res) => {
    rebuildAggregatesFromKeystrokes(db);
    res.json({ ok: true });
  });

  return router;
}
