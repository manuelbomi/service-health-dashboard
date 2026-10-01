import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import { servicesRouter } from './routes/servicesRoutes';
import { metricsRouter } from './routes/metricsRoutes';
import { alertsRouter } from './routes/alertsRoutes';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/services', servicesRouter);
  app.use('/api', metricsRouter);
  app.use('/api', alertsRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
