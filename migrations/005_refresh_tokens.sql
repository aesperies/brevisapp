-- Refresh-token rotation (brief 2A). Access JWTs become short-lived; a
-- long-lived, rotating, single-use refresh token lives here (hashed — the raw
-- value only ever exists in the user's httpOnly cookie). Rotation + reuse
-- detection: presenting an already-rotated token signals theft and revokes
-- the whole chain.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL UNIQUE,          -- sha256 hex of the raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    rotated_at  TIMESTAMPTZ,                        -- set when this token is exchanged
    replaced_by INTEGER REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
