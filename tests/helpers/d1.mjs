import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

/** Local/test adapter only. Production receives the native Sites D1 binding. */
export function createDatabase(filename = ':memory:', migrate = true) {
  const sqlite = new DatabaseSync(filename);
  if (migrate) sqlite.exec(readFileSync(new URL('../../drizzle/0000_insurance_pipeline.sql', import.meta.url), 'utf8'));
  function prepare(sql, args = []) {
    return {
      bind(...values) { return prepare(sql, values); },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args), success: true }; },
      async run() {
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
      },
    };
  }
  return { sqlite, prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
}
