-- Personal bookmarks are independent of curriculum, permissions and PDF files.
CREATE TABLE IF NOT EXISTS academy_pdf_bookmarks (
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  bookmark_key TEXT NOT NULL CHECK(length(bookmark_key)=64),
  file TEXT NOT NULL CHECK(length(file)<=4110),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  page_number INTEGER NOT NULL CHECK(page_number BETWEEN 0 AND 100000),
  page_label TEXT NOT NULL DEFAULT '' CHECK(length(page_label)<=40),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(account_id,bookmark_key)
) WITHOUT ROWID;
