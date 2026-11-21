-- 배포 때 BAZE 가 이 파일을 D1 에 적용한다. 바꿀 때는 기존 표를 지우지 말고 더하기만 한다.
CREATE TABLE IF NOT EXISTS rate_limit (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- 소유자가 /admin 에서 바꾸는 값(src/content.ts 의 settings). value 는 JSON. 없으면 content.ts 의 기본값.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

-- _base 의 /admin 견본이 쓰는 문의 표. 새 템플릿은 자기 표로 바꾸거나 지운다(아직 배포 전일 때만).
CREATE TABLE IF NOT EXISTS inquiry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  assignee TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','pending','approved','rejected','revoked')),
  requested_at TEXT
);
CREATE INDEX IF NOT EXISTS accounts_by_status ON accounts(status, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS only_one_owner ON accounts(role) WHERE role = 'owner';
CREATE TABLE IF NOT EXISTS nickname_credentials (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author INTEGER NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author INTEGER NOT NULL REFERENCES accounts(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN ('like','dislike')),
  PRIMARY KEY(post_id,account_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS comments_by_post ON comments(post_id, id);
-- Keep replies when the original comment is deleted. The post still owns both.
CREATE TABLE IF NOT EXISTS comment_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL,
  author INTEGER NOT NULL REFERENCES accounts(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS replies_by_thread ON comment_replies(post_id, parent_id, id);
CREATE TABLE IF NOT EXISTS board_edited_entries (
  post_id INTEGER UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  comment_id INTEGER UNIQUE REFERENCES comments(id) ON DELETE CASCADE,
  reply_id INTEGER UNIQUE REFERENCES comment_replies(id) ON DELETE CASCADE,
  CHECK ((post_id IS NOT NULL) + (comment_id IS NOT NULL) + (reply_id IS NOT NULL) = 1)
);
CREATE TABLE IF NOT EXISTS board_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('comment','reply')),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS board_notifications_recipient ON board_notifications(recipient,id DESC);
CREATE INDEX IF NOT EXISTS board_notifications_unread ON board_notifications(recipient) WHERE is_read=0;
CREATE TABLE IF NOT EXISTS board_push_devices (
  endpoint TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  key_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS board_push_by_session ON board_push_devices(session_hash);
CREATE TABLE IF NOT EXISTS deletion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS site_copy (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
