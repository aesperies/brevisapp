-- Cache translated summaries so switching UI language TRANSLATES the stored
-- summary (cheap) instead of regenerating it via a fresh Claude summarization
-- (expensive). The canonical summary stays in `summary` (+ `summary_language`);
-- this JSONB maps language code → translated text.
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS summary_translations JSONB;
