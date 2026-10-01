import * as alertsRepository from '../repositories/alertsRepository';
import { AlertRecord, AlertSeverity } from '../types/domain';

export async function getAlertHistory(
  serviceId: number,
  activeOnly = false,
  limit?: number
): Promise<AlertRecord[]> {
  return alertsRepository.getAlertHistory({ serviceId, activeOnly, limit });
}

export async function getRecentAlerts(limit?: number): Promise<AlertRecord[]> {
  return alertsRepository.getRecentAlertsAcrossServices(limit);
}

export async function triggerAlert(
  serviceId: number,
  severity: AlertSeverity,
  message: string
): Promise<AlertRecord> {
  return alertsRepository.insertAlert(serviceId, severity, message);
}
