import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db";
import { createApiRouter } from "./routes";
import { getCorpus, seedCorpus } from "./corpus";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../../dist");
const PORT = Number(process.env.PORT ?? 3000);

const db = getDb();

// Make `npm start` work without a manual seed step.
if (getCorpus(db, "prompts").length === 0) {
  const n = seedCorpus(db);
  console.log(`Pocket: seeded ${n} corpus items.`);
}

const app = express();
app.use(express.json({ limit: "16mb" }));
app.use("/api", createApiRouter(db));

if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(DIST, "index.html"));
  });
} else {
  console.warn("Pocket: dist/ not found — run `npm run build` (or use `npm run dev`).");
}

app.listen(PORT, () => {
  console.log(`Pocket running at http://localhost:${PORT}`);
});
