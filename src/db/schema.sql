-- ================================
-- SQLite schema for JSA-41-01 bot
-- ================================
PRAGMA foreign_keys = ON;

-- Idempotency: create tables only if missing
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_user_id      INTEGER NOT NULL UNIQUE,
  first_name      TEXT,
  last_name       TEXT,
  username        TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  last_seen_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  last_failed_at  DATETIME
);

CREATE TABLE IF NOT EXISTS exams (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE,          -- e.g., "JSA-41-01"
  title            TEXT NOT NULL,                 -- human title
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  pass_percent     INTEGER NOT NULL CHECK (pass_percent BETWEEN 0 AND 100),
  created_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Question bank
CREATE TABLE IF NOT EXISTS questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  section       TEXT NOT NULL CHECK (section IN ('objects','classes','builtins','advfunc')),
  type          TEXT NOT NULL CHECK (type IN ('single','multi')),
  text          TEXT NOT NULL,                    -- main stem
  code_snippet  TEXT,                             -- optional code block (markdown)
  explanation   TEXT,                             -- shown in review/practice
  is_active     INTEGER NOT NULL DEFAULT 1,       -- 1=true, 0=false
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL,
  text         TEXT NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Exam attempts / practice sessions
CREATE TABLE IF NOT EXISTS exam_sessions (
  id             TEXT PRIMARY KEY,                -- nanoid
  user_id        INTEGER NOT NULL,
  exam_id        INTEGER NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('exam','practice')),
  status         TEXT NOT NULL CHECK (status IN ('active','submitted','expired')),
  started_at     DATETIME NOT NULL,
  expires_at     DATETIME,                        -- null in practice
  finished_at    DATETIME,
  total_count    INTEGER NOT NULL DEFAULT 40,
  correct_count  INTEGER NOT NULL DEFAULT 0,
  score_percent  REAL NOT NULL DEFAULT 0.0,
  warn10_sent    INTEGER NOT NULL DEFAULT 0,
  warn5_sent     INTEGER NOT NULL DEFAULT 0,
  warn1_sent     INTEGER NOT NULL DEFAULT 0,
  current_index  INTEGER NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- The 40 questions selected for a session, in fixed order
CREATE TABLE IF NOT EXISTS session_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  question_id  INTEGER NOT NULL,
  q_index      INTEGER NOT NULL,                  -- 1..40
  flagged      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
  UNIQUE (session_id, q_index),
  UNIQUE (session_id, question_id)
);

-- Recorded selections (supports multi-select)
CREATE TABLE IF NOT EXISTS session_answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  question_id  INTEGER NOT NULL,
  answer_id    INTEGER NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE,
  UNIQUE (session_id, question_id, answer_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_status ON exam_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_expires_at  ON exam_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_answers_question          ON answers (question_id);
CREATE INDEX IF NOT EXISTS idx_sessq_session_qindex      ON session_questions (session_id, q_index);
CREATE INDEX IF NOT EXISTS idx_sessa_session_question    ON session_answers (session_id, question_id);

-- Metadata table (optional)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version','1');

-- Vacuum occasionally in maintenance cron, not here.
