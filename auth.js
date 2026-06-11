import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required. Server cannot start without it.');
}
const JWT_SECRET = process.env.JWT_SECRET;

export function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, tv: user.token_version ?? 0 },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Creates an authMiddleware that validates the JWT AND checks token_version against the DB.
 * Pass a getTokenVersion(userId) async function that returns the current token_version for the user.
 * This ensures that after a password reset, all previously issued JWTs are immediately invalidated.
 */
export function makeAuthMiddleware(getUserData) {
    return async function authMiddleware(req, res, next) {
        const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const decoded = verifyToken(token);

        if (!decoded) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Validate token_version and enrich req.user with live DB fields (plan, language, etc.)
        try {
            const userData = await getUserData(decoded.id);
            const currentVersion = typeof userData === 'object' ? (userData.token_version ?? 0) : (userData ?? 0);
            if ((decoded.tv ?? 0) !== currentVersion) {
                return res.status(401).json({ error: 'Session expired. Please log in again.' });
            }
            // Merge live DB fields into req.user so plan/language are always current
            if (typeof userData === 'object') {
                req.user = { ...decoded, ...userData };
            } else {
                req.user = decoded;
            }
        } catch (err) {
            // Fail closed: if we can't verify token_version against the DB we cannot
            // honor the request safely (revoked JWTs would silently re-validate during
            // any DB hiccup, including post-password-reset). Return 503 so clients
            // retry rather than acting on stale auth.
            console.error('[auth] DB check failed, refusing request:', err?.message || err);
            return res.status(503).json({ error: 'Service temporarily unavailable, please retry' });
        }

        next();
    };
}

// The legacy static authMiddleware (no token_version check) was removed in the
// 2026-06 hardening pass — always build the middleware via makeAuthMiddleware.

