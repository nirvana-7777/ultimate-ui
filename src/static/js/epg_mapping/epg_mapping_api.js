/**
 * EPG Mapping API Manager
 * Handles all API communication
 */

class EPGMappingAPI {
    constructor() {
        this.baseUrl = '/api';
    }

    // Provider endpoints
    async fetchProviders() {
        const response = await fetch(`${this.baseUrl}/mapping/providers`);
        return this.handleResponse(response);
    }

    // Streaming channel endpoints
    async fetchStreamingChannels(providerId) {
        const response = await fetch(`${this.baseUrl}/mapping/channels/${providerId}`);
        return this.handleResponse(response);
    }

    // EPG channel endpoints
    async fetchEPGChannels() {
        const response = await fetch(`${this.baseUrl}/channels`);
        return response.json(); // Direct JSON for this endpoint
    }

    // Alias endpoints
    async fetchAliases() {
        const response = await fetch(`${this.baseUrl}/aliases`);
        if (response.ok) {
            return await response.json();
        }
        return null; // Return null if endpoint doesn't exist
    }

    async fetchAliasesForEPGChannel(epgChannelId) {
        try {
            const response = await fetch(`${this.baseUrl}/channels/${epgChannelId}/aliases`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            // Silently fail - endpoint might not exist
        }
        return [];
    }

    async createAlias(channelIdentifier, alias, aliasType = 'ultimate_backend') {
        const response = await fetch(`${this.baseUrl}/mapping/create-alias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                channel_identifier: channelIdentifier,
                alias: alias,
                alias_type: aliasType
            })
        });
        return this.handleResponse(response);
    }

    async deleteAlias(aliasId) {
        const response = await fetch(`${this.baseUrl}/aliases/${aliasId}`, {
            method: 'DELETE'
        });
        return response.ok || response.status === 204;
    }

    // Helper method
    async handleResponse(response) {
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
    }

    // Bulk operations
    async bulkFetchAliases(streamingChannels, epgChannels) {
        // First try bulk endpoint
        try {
            const bulkData = await this.fetchAliases();
            if (bulkData?.aliases) {
                return bulkData.aliases;
            }
        } catch (error) {
            console.warn('Bulk alias endpoint failed:', error);
        }

        // Fallback: Fetch aliases individually (inefficient)
        const allAliases = [];
        // Implementation would go here...
        return allAliases;
    }
}

export default EPGMappingAPI;