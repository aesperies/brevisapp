import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting BREVIS minimal server...');
console.log('📁 __dirname:', __dirname);
console.log('🔌 PORT:', PORT);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'BREVIS is running' });
});

// SPA fallback
app.get('*', (req, res) => {
    console.log('📄 Serving index.html for:', req.url);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║              BREVIS Server (MINIMAL)                   ║
╠════════════════════════════════════════════════════════╣
║   Server: http://0.0.0.0:${PORT}                         ║
║   Static: public/                                      ║
║   Status: ✅ RUNNING                                   ║
╚════════════════════════════════════════════════════════╝
    `);
});
