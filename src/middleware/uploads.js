// Shared multer instance for all file uploads (memory storage).
// Moved verbatim from server.js during the 2026-06 architecture refactor.

import multer from 'multer';

export const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max
