// Single source of truth for the default model. Per-prompt overrides go in
// the prompt module itself (e.g. a premium-only prompt pinning a bigger model).
// claude-sonnet-4-20250514 was retired 2026-06-15; claude-sonnet-4-6 is the
// drop-in successor (same Messages API surface — no temperature/thinking/prefill
// in our calls, so no other changes needed).
export const DEFAULT_MODEL = 'claude-sonnet-4-6';
