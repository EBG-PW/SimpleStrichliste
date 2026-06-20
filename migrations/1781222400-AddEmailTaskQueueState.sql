-- Add queue state and retry tracking to email tasks.
ALTER TABLE email_tasks
ADD COLUMN priority SMALLINT NOT NULL DEFAULT 0
CHECK (priority BETWEEN -32768 AND 32767);

ALTER TABLE email_tasks
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0
CHECK (retry_count >= 0);

-- 0 = pending, 1 = sent, 2 = failed
ALTER TABLE email_tasks
ADD COLUMN status SMALLINT NOT NULL DEFAULT 0
CHECK (status IN (0, 1, 2));

ALTER TABLE email_tasks
ADD COLUMN last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_email_tasks_send_queue
ON email_tasks (status, retry_count, created_timestamp);
