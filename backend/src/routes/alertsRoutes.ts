import { Router } from 'express';
import * as alertsService from '../services/alertsService';

export const alertsRouter = Router();

// GET /api/services/:id/alerts?activeOnly=true&limit=50
alertsRouter.get('/services/:id/alerts', async (req, res, next) => {
  try {
    const serviceId = Number(req.params.id);
    if (!Number.isInteger(serviceId)) {
      res.status(400).json({ error: 'id must be an integer' });
      return;
    }
    const activeOnly = req.query.activeOnly === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const alerts = await alertsService.getAlertHistory(serviceId, activeOnly, limit);
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts/recent?limit=50 — cross-service alert feed for the
// dashboard's historical view.
alertsRouter.get('/alerts/recent', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const alerts = await alertsService.getRecentAlerts(limit);
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});
