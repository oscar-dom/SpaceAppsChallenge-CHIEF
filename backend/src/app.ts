import { API_PREFIX } from '@chief/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { errorHandler, notFound } from './middlewares/error-handler.js';
import { apiRouter } from './routes/index.js';
import type { Services } from './services/index.js';

export interface AppOptions {
  services: Services;
  logger: Logger;
  corsOrigin: string;
}

/** The Express app, without listening: server.ts starts it and the tests use it directly. */
export function createApp({ services, logger, corsOrigin }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));
  // One short line per request ("GET /api/crew 200 3ms"): full headers would bury the
  // simulator and agent logs. Client errors are warnings, server errors are errors.
  app.use(
    pinoHttp({
      logger,
      quietReqLogger: true,
      serializers: { req: () => undefined, res: () => undefined },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${req.url} ${res.statusCode}: ${err.message}`,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use(API_PREFIX, apiRouter(services));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
