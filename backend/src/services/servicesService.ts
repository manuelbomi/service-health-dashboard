import * as servicesRepository from '../repositories/servicesRepository';
import { ServiceRecord } from '../types/domain';

export async function getAllServices(): Promise<ServiceRecord[]> {
  return servicesRepository.listServices();
}

export async function getService(id: number): Promise<ServiceRecord | null> {
  return servicesRepository.getServiceById(id);
}
