CREATE TABLE records_new (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('task','project','event','note','settings','vault')),
 data TEXT NOT NULL CHECK(json_valid(data)),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO records_new (id,kind,data,updated_at)
SELECT id,kind,data,updated_at FROM records;
DROP TABLE records;
ALTER TABLE records_new RENAME TO records;
CREATE INDEX records_kind ON records(kind);
