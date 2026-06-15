// Transparent refresh-token rotation at the fetch boundary. Installed once in
// main.jsx so all ~20 fetch() call sites in App.jsx get silent re-auth for
// free — no per-call-site changes.
//
// On any same-origin /api 401 (except the auth endpoints themselves), we call
// POST /api/auth/refresh once. If it succeeds, the original request is retried
// with the fresh access cookie. Concurrent 401s share a single in-flight
// refresh (single-flight) so a burst of requests triggers exactly one rotation.

let refreshInFlight = null;

function isApiRequest(url) {
    try {
        const u = new URL(url, window.location.origin);
        return u.origin === window.location.origin && u.pathname.startsWith('/api/');
    } catch {
        return false;
    }
}

// Don't try to refresh these — refresh/login/logout/register 401s are terminal.
const AUTH_PATHS = ['/api/auth/refresh', '/api/auth/login', '/api/auth/register', '/api/auth/logout'];
function isAuthEndpoint(url) {
    try {
        const path = new URL(url, window.location.origin).pathname;
        return AUTH_PATHS.some((p) => path === p || path === p.replace('/api/', '/api/v1/'));
    } catch {
        return false;
    }
}

export function installAuthRefresh() {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input?.url || '';
        const res = await nativeFetch(input, init);

        if (res.status !== 401 || !isApiRequest(url) || isAuthEndpoint(url)) {
            return res;
        }

        // Single-flight refresh shared across concurrent 401s.
        if (!refreshInFlight) {
            refreshInFlight = nativeFetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include',
            })
                .then((r) => r.ok)
                .catch(() => false)
                .finally(() => {
                    // Clear after the microtask so racing 401s reuse this result.
                    setTimeout(() => { refreshInFlight = null; }, 0);
                });
        }

        const refreshed = await refreshInFlight;
        if (!refreshed) return res; // session truly dead — let the 401 propagate

        // Retry the original request once with the new access cookie.
        return nativeFetch(input, { credentials: 'include', ...init });
    };
}
