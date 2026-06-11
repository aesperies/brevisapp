-- newsletters.is_read was INTEGER 0/1 (SQLite heritage). It caused a real
-- prod bug: express-validator's .toBoolean() produced a JS boolean that pg
-- refused to write into an INTEGER column (PATCH /api/newsletters/:id 500'd).
-- Guarded so a fresh install (where setupDatabase already creates BOOLEAN)
-- is a no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'newsletters'
          AND column_name = 'is_read'
          AND data_type = 'integer'
    ) THEN
        ALTER TABLE newsletters ALTER COLUMN is_read DROP DEFAULT;
        ALTER TABLE newsletters ALTER COLUMN is_read TYPE BOOLEAN USING (is_read <> 0);
        ALTER TABLE newsletters ALTER COLUMN is_read SET DEFAULT FALSE;
    END IF;
END $$;
