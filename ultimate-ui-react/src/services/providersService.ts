import { api } from '@/lib/api';
import type { Provider, ImportLog } from '@/lib/types';

export const providersService = {
  async list(): Promise<Provider[]> {
    return api.get<Provider[]>('/api/providers');
  },
  async importLogs(): Promise<ImportLog[]> {
    const data = await api.get<any>('/api/import/status');
    return data?.recent_imports || [];
  },
  async create(data: { name: string; xmltv_url: string; enabled: boolean }) {
    return api.post('/api/providers', data);
  },
  async update(id: number, data: Partial<Provider>) {
    return api.put(`/api/providers/${id}`, data);
  },
  async remove(id: number) {
    return api.delete(`/api/providers/${id}`);
  },
  async test(id: number) {
    return api.get<any>(`/api/providers/${id}/test`);
  },
  async triggerImport(id: number) {
    return api.post(`/api/providers/${id}/import/trigger`);
  },
};
