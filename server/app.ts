import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerRoutes, ApiError } from './routes.js';
import { getLanAddresses } from './lan.js';

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));

  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) {
    app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      const key = req.header('X-Api-Key');
      if (key !== apiKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });
  }

  app.get('/health', (_req, res) => {
    const port = Number(process.env.PORT ?? 4000);
    const lanIps = getLanAddresses();
    res.json({
      status: 'ok',
      version: readPackageVersion(),
      port,
      lanUrls: lanIps.map((ip) => `http://${ip}:${port}`),
    });
  });

  const api = express.Router();
  registerRoutes(api);
  app.use('/api', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export type StartServerOptions = {
  port?: number;
  host?: string;
};

export function startServer(options: StartServerOptions = {}): ReturnType<Express['listen']> {
  const port = options.port ?? Number(process.env.PORT ?? 4000);
  const host = options.host ?? '0.0.0.0';
  const app = createApp();
  const server = app.listen(port, host, () => {
    const lanIps = getLanAddresses();
    console.log(`Executive Suite API listening on http://${host}:${port}`);
    if (lanIps.length > 0) {
      console.log('LAN URLs:', lanIps.map((ip) => `http://${ip}:${port}`).join(', '));
    }
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\nPort ${port} is already in use. Another API instance may still be running.\n` +
          'Run: npm run free-ports\n' +
          'Or stop the process manually: lsof -nP -iTCP:4000 -sTCP:LISTEN\n',
      );
      process.exit(1);
    }
    throw err;
  });
  return server;
}
