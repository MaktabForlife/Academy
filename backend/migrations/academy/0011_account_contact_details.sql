-- Optional private contact details. Existing accounts and login IDs stay intact.
CREATE TABLE account_contact_details (
  account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  whatsapp_number TEXT NOT NULL DEFAULT '' CHECK (length(whatsapp_number) <= 32),
  updated_at TEXT NOT NULL,
  updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id)
);
