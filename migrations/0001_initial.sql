CREATE TABLE IF NOT EXISTS records (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('task','project','event','note','settings')),
 data TEXT NOT NULL CHECK(json_valid(data)),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
CREATE TABLE IF NOT EXISTS mail (
 id TEXT PRIMARY KEY,
 folder TEXT NOT NULL CHECK(folder IN ('inbox','sent','drafts','archive','trash')),
 sender TEXT NOT NULL,
 recipient TEXT NOT NULL,
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 received_at TEXT NOT NULL,
 unread INTEGER NOT NULL DEFAULT 0,
 message_id TEXT,
 reply_to TEXT,
 attachments TEXT NOT NULL DEFAULT '[]',
 provider_id TEXT,
 send_state TEXT NOT NULL DEFAULT 'draft' CHECK(send_state IN ('draft','pending','sent','failed')),
 send_payload TEXT
);
CREATE INDEX IF NOT EXISTS mail_folder_date ON mail(folder,received_at);
CREATE UNIQUE INDEX IF NOT EXISTS mail_message_id ON mail(message_id) WHERE message_id IS NOT NULL;
