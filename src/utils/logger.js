// ============= STRUCTURED LOGGING =============
// Moved verbatim from server.js during the 2026-06 architecture refactor.

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Mask emails in logs for privacy (an***@gmail.com)
export const maskEmail = (email) => {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    return local.slice(0, 2) + '***@' + domain;
};

export const log = {
    _emit(level, msg, meta = {}) {
        if (LEVELS[level] > LEVELS[LOG_LEVEL]) return;
        const entry = { level, msg, ts: new Date().toISOString(), ...meta };
        // Redact sensitive fields
        if (entry.email) entry.email = maskEmail(entry.email);
        if (entry.token) entry.token = '[REDACTED]';
        if (entry.password) entry.password = '[REDACTED]';
        if (level === 'error') console.error(JSON.stringify(entry));
        else console.log(JSON.stringify(entry));
    },
    error: (msg, meta) => log._emit('error', msg, meta),
    warn:  (msg, meta) => log._emit('warn', msg, meta),
    info:  (msg, meta) => log._emit('info', msg, meta),
    debug: (msg, meta) => log._emit('debug', msg, meta),
};
