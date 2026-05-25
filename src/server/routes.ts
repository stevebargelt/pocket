import { Router } from "express";
import type { Db } from "./db";
import { generateText } from "./generator";
import { getHistory, saveSession } from "./sessions";
import { buildRecommendation } from "./recommender";
import { rebuildAggregatesFromKeystrokes } from "./aggregate";
import type { PracticeMode, SessionPayload } from "../shared/types";

export function createApiRouter(db: Db): Router {
  const router = Router();

  router.get("/text", (req, res) => {
    const mode: PracticeMode = req.query.mode === "targeted" ? "targeted" : "random";
    res.json(generateText(db, mode));
  });

  router.post("/session", (req, res) => {
    const payload = req.body as SessionPayload;
    if (!payload || !Array.isArray(payload.keystrokes) || typeof payload.startedAt !== "number") {
      res.status(400).json({ error: "invalid session payload" });
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
