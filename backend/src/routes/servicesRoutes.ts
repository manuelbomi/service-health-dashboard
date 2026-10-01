import { Router } from 'express';
import * as servicesService from '../services/servicesService';

export const servicesRouter = Router();

servicesRouter.get('/', async (_req, res, next) => {
  try {
    const services = await servicesService.getAllServices();
    res.json(services);
  } catch (err) {
    next(err);
  }
});

servicesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id must be an integer' });
      return;
    }
    const service = await servicesService.getService(id);
    if (!service) {
      res.status(404).json({ error: 'service not found' });
      return;
    }
    res.json(service);
  } catch (err) {
    next(err);
  }
});
