import { api } from '@/lib/api';
import type { MonitoringData } from '@/lib/types';

export const monitoringService = {
  async getStatus(): Promise<MonitoringData> {
    return api.get<MonitoringData>('/api/monitoring/status');
  },
  async triggerImport() {
    return api.post<any>('/api/import/trigger');
  },
  async testWebEPG() {
    return api.get<any>('/api/test/webepg');
  },
  async testUltimate() {
    return api.get<any>('/api/test/ultimate-backend');
  },
};
