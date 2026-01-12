/**
 * EPG Mapping State Manager
 * Manages all application state
 */

class EPGMappingState {
    constructor() {
        this.reset();
    }

    reset() {
        this.providers = [];
        this.selectedProvider = null;
        this.streamingChannels = [];
        this.epgChannels = [];
        this.aliases = new Map(); // streamingId -> alias data
        this.currentMapping = null; // { streamingId, epgId } for drag operation
        this.searchTerm = '';
        this.pendingUnmap = null;

        this.isLoading = {
            providers: false,
            streaming: false,
            epg: false,
            mapping: false
        };

        // Channel lookup maps
        this.channelLookup = {
            streaming: new Map(), // streamingId -> channel data
            epg: new Map(), // epgId -> channel data
            aliasToStreaming: new Map() // alias -> streamingId
        };

        // Cache for better performance
        this.cache = {
            providers: null,
            epgChannels: null,
            aliases: null
        };

        // NEW: Statistics
        this.stats = {
            mapped: 0,
            tentative: 0,
            unmapped: 0
        };
    }

    // Getters for computed state
    get filteredEPGChannels() {
        if (!this.searchTerm) return this.epgChannels;

        return this.epgChannels.filter(channel => {
            const displayName = channel.display_name || '';
            const name = channel.name || '';
            const id = channel.id?.toString() || channel.identifier || '';

            return displayName.toLowerCase().includes(this.searchTerm) ||
                   name.toLowerCase().includes(this.searchTerm) ||
                   id.toLowerCase().includes(this.searchTerm);
        });
    }

    get mappedCount() {
        return this.aliases.size;
    }

    // NEW: Update stats
    updateStats(tentativeCount = 0) {
        const total = this.streamingChannels.length;
        const mapped = this.aliases.size;
        const tentative = tentativeCount;
        const unmapped = total - mapped - tentative;

        this.stats = {
            mapped: Math.max(0, mapped),
            tentative: Math.max(0, tentative),
            unmapped: Math.max(0, unmapped),
            total: total
        };
    }

    isChannelMapped(streamingId) {
        return this.aliases.has(streamingId);
    }

    getAliasInfo(streamingId) {
        return this.aliases.get(streamingId);
    }

    addAlias(streamingId, aliasData) {
        this.aliases.set(streamingId, aliasData);
        if (aliasData.epgChannelId) {
            this.channelLookup.aliasToStreaming.set(aliasData.epgChannelId, streamingId);
        }
        this.updateStats(); // Update stats when alias is added
    }

    removeAlias(streamingId) {
        const aliasInfo = this.aliases.get(streamingId);
        if (aliasInfo?.epgChannelId) {
            this.channelLookup.aliasToStreaming.delete(aliasInfo.epgChannelId);
        }
        this.aliases.delete(streamingId);
        this.updateStats(); // Update stats when alias is removed
    }
}

export default EPGMappingState;