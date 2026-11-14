import { api } from '@/lib/api';

export const mappingService = {
  async listProviders() {
    return api.get<any>('/api/mapping/providers');
  },
  async listProviderChannels(providerId: string) {
    return api.get<any>(`/api/mapping/channels/${providerId}`);
  },
  async listEPGChannels() {
    return api.get<any>('/api/channels');
  },
  async createAlias(channelIdentifier: string, alias: string, aliasType = 'ultimate_backend') {
    return api.post<any>('/api/mapping/create-alias', {
      channel_identifier: channelIdentifier,
      alias,
      alias_type: aliasType,
    });
  },
  async deleteAlias(aliasId: number) {
    return api.delete(`/api/aliases/${aliasId}`);
  },
  async listAliases() {
    return api.get<any>('/api/aliases');
  },
};
