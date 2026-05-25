import { getDb } from "../src/server/db";
import { seedCorpus } from "../src/server/corpus";

const n = seedCorpus(getDb());
console.log(`seed-corpus: loaded ${n} corpus items into corpus_items.`);
