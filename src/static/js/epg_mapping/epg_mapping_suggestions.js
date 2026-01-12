/**
 * EPG Mapping Suggestions Manager
 * Manages automatic suggestions and tentative matches
 */

class EPGMappingSuggestions {
    constructor(stateManager, fuzzyManager) {
        this.state = stateManager;
        this.fuzzy = fuzzyManager;
        this.suggestions = new Map(); // streamingId -> suggestion data
    }

    // Generate suggestions for all unmapped streaming channels
    generateSuggestions() {
        this.suggestions.clear();

        // Only generate suggestions for unmapped channels
        this.state.streamingChannels.forEach(streamingChannel => {
            const streamingId = streamingChannel.Id || streamingChannel.channel_id || streamingChannel.id || streamingChannel.name;

            // Skip if already mapped
            if (this.state.isChannelMapped(streamingId)) return;

            const bestSuggestion = this.fuzzy.findBestMatch(streamingChannel, this.state.epgChannels);

            if (bestSuggestion && bestSuggestion.score >= this.fuzzy.minMatchScore) {
                this.suggestions.set(streamingId, {
                    ...bestSuggestion,
                    streamingChannel: streamingChannel
                });
            }
        });

        return this.suggestions;
    }

    // Get suggestion for a specific streaming channel
    getSuggestion(streamingId) {
        return this.suggestions.get(streamingId);
    }

    // Check if a channel has a tentative match
    hasTentativeMatch(streamingId) {
        return this.suggestions.has(streamingId);
    }

    // Get all channels with tentative matches
    getTentativeChannels() {
        return Array.from(this.suggestions.keys());
    }

    // Count of tentative matches
    getTentativeCount() {
        return this.suggestions.size;
    }

    // Accept a suggestion (convert tentative to confirmed)
    acceptSuggestion(streamingId) {
        const suggestion = this.suggestions.get(streamingId);
        if (!suggestion) return null;

        // Remove from suggestions
        this.suggestions.delete(streamingId);

        return {
            streamingId: streamingId,
            epgId: suggestion.epgId,
            confidence: suggestion.score,
            streamingName: suggestion.streamingChannel.Name || suggestion.streamingChannel.name,
            epgDisplayName: suggestion.displayName
        };
    }

    // Clear all suggestions
    clear() {
        this.suggestions.clear();
    }
}

export default EPGMappingSuggestions;