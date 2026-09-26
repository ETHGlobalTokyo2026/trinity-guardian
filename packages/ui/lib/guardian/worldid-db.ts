import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type VerifiedPerson = {
  nullifier: string;
  appId: string;
  rpId: string;
  action: string;
  approvalId: string | null;
  verifiedAt: string;
  lastVerifiedAt: string;
};

const FILE = join(process.cwd(), "data", "world-id.sqlite");

let db: DatabaseSync | undefined;

function database(): DatabaseSync {
  if (!db) {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    db = new DatabaseSync(FILE);
    db.exec(`
      CREATE TABLE IF NOT EXISTS world_id_people (
        nullifier TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        rp_id TEXT NOT NULL,
        action TEXT NOT NULL,
        approval_id TEXT,
        verified_at TEXT NOT NULL,
        last_verified_at TEXT NOT NULL
      )
    `);
  }
  return db;
}

export function recordVerifiedPerson(input: {
  nullifier: string;
  appId: string;
  rpId: string;
  action: string;
  approvalId?: string;
}): VerifiedPerson {
  const now = new Date().toISOString();
  database()
    .prepare(
      `INSERT INTO world_id_people (nullifier, app_id, rp_id, action, approval_id, verified_at, last_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(nullifier) DO UPDATE SET
         app_id = excluded.app_id,
         rp_id = excluded.rp_id,
         action = excluded.action,
         approval_id = excluded.approval_id,
         last_verified_at = excluded.last_verified_at`,
    )
    .run(input.nullifier, input.appId, input.rpId, input.action, input.approvalId ?? null, now, now);
  const stored = getVerifiedPerson(input.nullifier);
  if (!stored) throw new Error("failed to store verified person");
  return stored;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function getVerifiedPerson(nullifier: string): VerifiedPerson | undefined {
  const row = database().prepare("SELECT * FROM world_id_people WHERE nullifier = ?").get(nullifier);
  if (!row) return undefined;
  return {
    nullifier: text(row.nullifier),
    appId: text(row.app_id),
    rpId: text(row.rp_id),
    action: text(row.action),
    approvalId: row.approval_id == null ? null : String(row.approval_id),
    verifiedAt: text(row.verified_at),
    lastVerifiedAt: text(row.last_verified_at),
  };
}
