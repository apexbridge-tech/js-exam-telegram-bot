import type sqlite3 from "sqlite3";
import { getDb } from "../db/sqlite.js";

export interface TgUserLite {
  id?: number;
  tg_user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

/**
 * Upserts a Telegram user and returns the internal numeric user id.
 */
export async function upsertUser(u: TgUserLite): Promise<number> {
  const db: sqlite3.Database = getDb();

  return new Promise<number>((resolve, reject) => {
    db.run(
      `INSERT INTO users (tg_user_id, first_name, last_name, username)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tg_user_id) DO UPDATE SET
         first_name=excluded.first_name,
         last_name=excluded.last_name,
         username=excluded.username,
         last_seen_at=datetime('now')`,
      [
        u.tg_user_id,
        u.first_name ?? null,
        u.last_name ?? null,
        u.username ?? null,
      ],
      function (this: sqlite3.RunResult, err: Error | null): void {
        if (err) {
          reject(err);
          return;
        }
        db.get(
          `SELECT id FROM users WHERE tg_user_id=? LIMIT 1`,
          [u.tg_user_id],
          (e: Error | null, row: { id: number } | undefined): void => {
            if (e) {
              reject(e);
              return;
            }
            if (!row) {
              reject(new Error("User upserted but id not found"));
              return;
            }
            resolve(row.id);
          }
        );
      }
    );
  });
}

export interface UserRow {
  id: number;
  tg_user_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  created_at: string;
  last_seen_at: string;
  last_failed_at: string | null;
}

export async function getUserById(id: number): Promise<UserRow | undefined> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, tg_user_id, first_name, last_name, username, created_at, last_seen_at, last_failed_at FROM users WHERE id=? LIMIT 1`,
      [id],
      (err: Error | null, row: UserRow | undefined): void =>
        err ? reject(err) : resolve(row)
    );
  });
}

export interface UserService {
  getUserById(id: number): Promise<UserRow | undefined>;
  upsertUser(u: TgUserLite): Promise<number>;
}

export const userService: UserService = {
  getUserById,
  upsertUser,
};
