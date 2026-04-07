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
        } catch {
            // If DB check fails, allow the request through (fail-open to avoid total outage)
            req.user = decoded;
        }

        next();
    };
}

// Backwards-compatible static authMiddleware (no token_version check) — used as fallback only.
export function authMiddleware(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
}
