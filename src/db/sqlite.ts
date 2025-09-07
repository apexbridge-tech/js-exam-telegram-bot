import sqlite3 from "sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

let db: sqlite3.Database | null = null;

export async function initDb(dbFile: string): Promise<sqlite3.Database> {
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  sqlite3.verbose();
  db = new sqlite3.Database(dbFile);

  await exec("PRAGMA foreign_keys = ON;");
  await exec("PRAGMA journal_mode = WAL;");

  // Auto-apply schema if users table doesn't exist
  const exists = await tableExists("users");
  if (!exists) {
    const schemaPath = locateSchemaPath();
    const sql = fs.readFileSync(schemaPath, "utf8");
    await exec(sql);
    logger.info(`Applied schema from ${schemaPath}`);
  } else {
    logger.info(`SQLite ready at ${dbFile} (schema already present)`);
  }

  return db;
}

export function getDb(): sqlite3.Database {
  if (!db) throw new Error("DB not initialized");
  return db;
}

function exec(sql: string) {
  return new Promise<void>((resolve, reject) => {
    if (!db) return reject(new Error("DB not initialized"));
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function get<T = any>(sql: string, params: any[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    if (!db) return reject(new Error("DB not initialized"));
    db.get(sql, params, (err, row) =>
      err ? reject(err) : resolve(row as T | undefined)
    );
  });
}

async function tableExists(name: string): Promise<boolean> {
  const row = await get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    [name]
  );
  return !!row;
}

function locateSchemaPath(): string {
  // Prefer compiled asset: dist/db/schema.sql (same folder as this file after build)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distCandidate = path.resolve(here, "schema.sql");
  if (fs.existsSync(distCandidate)) return distCandidate;

  // Fallback: dev path from project root
  const devCandidate = path.resolve(process.cwd(), "src", "db", "schema.sql");
  if (fs.existsSync(devCandidate)) return devCandidate;

  throw new Error("schema.sql not found in dist/db or src/db");
}
