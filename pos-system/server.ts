import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Health check for the dev host itself. The application's own health lives on
// the Spring actuator behind /api.
app.get('/api/dev-health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Keep the browser on one origin so the backend session and CSRF cookies work
// in both development and production.
app.use('/api', async (req, res) => {
  const apiBaseUrl = process.env.POS_API_URL || 'http://localhost:8080';
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || ['host', 'content-length', 'connection'].includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  try {
    let body: BodyInit | undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const contentType = req.headers['content-type'] || '';
      if (contentType.toLowerCase().startsWith('application/json')) {
        // express.json() has already consumed JSON requests, so reconstruct
        // those from the parsed value.
        body = JSON.stringify(req.body ?? {});
      } else {
        // Other request types (especially multipart/form-data) must be
        // forwarded byte-for-byte. Replacing them with "{}" keeps the
        // multipart Content-Type header but drops every part, which makes
        // Spring report that the required `file` part is missing.
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawBody = Buffer.concat(chunks);
        body = rawBody.length > 0 ? rawBody : undefined;
      }
    }

    const response = await fetch(`${apiBaseUrl}${req.originalUrl}`, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      // A catalogue import of several hundred rows takes longer than 15 s.
      // Cutting it off reported "Cannot reach the POS API" while the server went
      // on to save every row, so the operator retried and imported it twice.
      signal: AbortSignal.timeout(req.originalUrl.startsWith('/api/products/import') ? 300_000 : 15_000),
    });

    response.headers.forEach((value, name) => {
      if (!['content-length', 'transfer-encoding', 'connection', 'set-cookie'].includes(name)) {
        res.setHeader(name, value);
      }
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader('set-cookie', cookies);
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.status(502).json({ code: 'API_UNAVAILABLE', message: 'Cannot reach the POS API' });
  }
});

// 3. Vite development middleware or static production serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Radiance POS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
