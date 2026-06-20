-- Preserve the recipient details used when an email is queued.
-- This is required for account-deletion emails because users are anonymized immediately.
ALTER TABLE email_tasks ADD COLUMN recipient_uuid TEXT;
ALTER TABLE email_tasks ADD COLUMN recipient_name TEXT;
ALTER TABLE email_tasks ADD COLUMN recipient_email TEXT;
ALTER TABLE email_tasks ADD COLUMN recipient_username TEXT;
ALTER TABLE email_tasks ADD COLUMN recipient_language TEXT;
