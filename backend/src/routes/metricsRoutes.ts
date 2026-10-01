import { Router } from 'express';
import * as metricsService from '../services/metricsService';
import { MetricType } from '../types/domain';

const VALID_METRIC_TYPES: MetricType[] = [
  'latency_ms',
  'error_rate',
  'throughput_rps',
  'cpu_pct',
  'memory_pct',
];

export const metricsRouter = Router();

// GET /api/services/:id/metrics?metricType=latency_ms&sinceMinutes=60&limit=200
// Historical metric query backed by idx_metric_events_service_type_time.
metricsRouter.get('/services/:id/metrics', async (req, res, next) => {
  try {
    const serviceId = Number(req.params.id);
    if (!Number.isInteger(serviceId)) {
      res.status(400).json({ error: 'id must be an integer' });
      return;
    }

    const metricTypeRaw = req.query.metricType as string | undefined;
    if (metricTypeRaw && !VALID_METRIC_TYPES.includes(metricTypeRaw as MetricType)) {
      res.status(400).json({ error: `invalid metricType: ${metricTypeRaw}` });
      return;
    }

    const sinceMinutes = req.query.sinceMinutes
      ? Number(req.query.sinceMinutes)
      : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const events = await metricsService.getMetricHistory({
      serviceId,
      metricType: metricTypeRaw as MetricType | undefined,
      sinceMinutes,
      limit,
    });
    res.json(events);
  } catch (err) {
    next(err);
  }
});
