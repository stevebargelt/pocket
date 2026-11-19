// The only SQL identifiers that are ever interpolated into a query string.
// SQLite cannot bind a table or column name as a `?` parameter, so callers pick
// an entry by StatKind and the SQL text is built from these constants alone.
// test/sql-safety.test.ts enforces that no other value reaches SQL text.

export const STAT_TABLES = {
  key: { table: "key_stats", unitCol: "key" },
  bigram: { table: "bigram_stats", unitCol: "bigram" },
} as const;

export type StatKind = keyof typeof STAT_TABLES;
