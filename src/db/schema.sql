CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  job_name TEXT,
  status TEXT CHECK(status IN ('pending','running','done','cancelled','failed')),
  url_column TEXT,
  variables_json TEXT,
  cooldown_seconds INTEGER,
  api_key_name TEXT,
  row_count INTEGER,
  created_at TEXT,
  updated_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT REFERENCES jobs(id),
  row_index INTEGER,
  input_json TEXT,
  output_json TEXT,
  status TEXT CHECK(status IN ('pending','scraped','extracted','failed')),
  error TEXT
);

CREATE TABLE IF NOT EXISTS provider_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT REFERENCES jobs(id),
  api_key_name TEXT,
  provider TEXT,
  purpose TEXT,
  row_index INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_cached INTEGER,
  credits REAL,
  usd_equivalent REAL,
  status TEXT,
  duration_ms INTEGER,
  timestamp TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_rows_job_id ON rows(job_id);
CREATE INDEX IF NOT EXISTS idx_rows_status ON rows(status);
CREATE INDEX IF NOT EXISTS idx_usage_job_id ON provider_usage(job_id);
