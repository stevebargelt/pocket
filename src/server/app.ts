import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db";
import { createApiRouter, type KeymapPort } from "./routes";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIST_DIR = resolve(HERE, "../../dist");

export interface CreateAppOptions {
  /** Keymap port for the API router; defaults to the router's no-keymap sentinel. */
  keymap?: KeymapPort;
  /** Built SPA directory to serve. Defaults to the real `dist/`; pass `null` to mount no static route. */
  distDir?: string | null;
}

/**
 * Final error handler: client errors that body-parser (or http-errors) marks as
 * exposable keep their 4xx status and message; everything else is logged and
 * returned as an opaque 500 so stacks and internals never reach the client.
 */
const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err?.status ?? err?.statusCode;
  if (typeof status === "number" && status >= 400 && status <= 499 && err.expose === true) {
    res.status(status).json({ error: String(err.message) });
    return;
  }
  console.error("Pocket: unhandled error", err);
  res.status(500).json({ error: "internal error" });
};

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Assemble Pocket's Express app: security headers, JSON body parsing, the `/api`
 * router with a JSON 404 for unknown API paths, (when built) the static SPA, and
 * a final JSON error handler. No DB open, seeding, watching or
 * listening happens here, so tests can exercise the real middleware stack.
 */
export function createApp(db: Db, opts: CreateAppOptions = {}): express.Express {
  const { keymap, distDir = DEFAULT_DIST_DIR } = opts;
  const app = express();

  app.disable("x-powered-by");
  // Pocket serves plain HTTP on localhost: no HSTS, and no upgrade-insecure-requests
  // (it would rewrite http://localhost:3000 asset loads to https and break the app).
  app.use(
    helmet({
      strictTransportSecurity: false,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: null },
      },
    }),
  );
  app.use(express.json({ limit: "16mb" }));
  app.use("/api", createApiRouter(db, keymap));
  // Unknown /api paths get a JSON 404 rather than falling through to the SPA.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  if (distDir !== null && isDirectory(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(join(distDir, "index.html"));
    });
  } else if (distDir !== null) {
    console.warn("Pocket: dist/ not found — run `npm run build` (or use `npm run dev`).");
  }

  app.use(jsonErrorHandler);

  return app;
}
