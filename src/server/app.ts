import express from "express";
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

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Assemble Pocket's Express app: security headers, JSON body parsing, the `/api`
 * router, and (when built) the static SPA. No DB open, seeding, watching or
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

  if (distDir !== null && isDirectory(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(join(distDir, "index.html"));
    });
  } else if (distDir !== null) {
    console.warn("Pocket: dist/ not found — run `npm run build` (or use `npm run dev`).");
  }

  return app;
}
