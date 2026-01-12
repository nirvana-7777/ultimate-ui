/**
 * EPG Mapping Fuzzy Matching Manager
 * Handles fuzzy matching between streaming channels and EPG channels
 */

class EPGMappingFuzzy {
    constructor() {
        this.fuzzySet = null;
        this.minMatchScore = 70; // Minimum score for tentative match
        this.confidentMatchScore = 85; // Score for automatic mapping
    }

    // Initialize with EPG channels
    initialize(epgChannels) {
        // Extract display names from EPG channels
        const displayNames = epgChannels.map(channel => {
            return channel.display_name || channel.name || channel.id?.toString() || '';
        }).filter(name => name.length > 0);

        // Create FuzzySet
        this.fuzzySet = new FuzzySet(displayNames);

        // Also create lookup maps for quick access
        this.epgLookupByName = new Map();
        epgChannels.forEach(channel => {
            const displayName = channel.display_name || channel.name || channel.id?.toString();
            if (displayName) {
                this.epgLookupByName.set(displayName.toLowerCase(), channel);
            }
        });
    }

    // Find suggestions for a streaming channel
    findSuggestions(streamingChannel, epgChannels) {
        if (!this.fuzzySet) return [];

        const streamingName = streamingChannel.Name || streamingChannel.name || '';
        if (!streamingName) return [];

        const results = this.fuzzySet.get(streamingName);
        if (!results || results.length === 0) return [];

        return results.map(([score, matchedName]) => {
            const percentageScore = Math.round(score * 100);

            // Find the EPG channel for this display name
            let epgChannel = null;
            const normalizedName = matchedName.toLowerCase();

            // Try to find by display name first
            for (const channel of epgChannels) {
                const displayName = channel.display_name || '';
                const name = channel.name || '';

                if (displayName.toLowerCase() === normalizedName ||
                    name.toLowerCase() === normalizedName) {
                    epgChannel = channel;
                    break;
                }
            }

            // Fallback: search in epgLookupByName
            if (!epgChannel) {
                epgChannel = this.epgLookupByName.get(normalizedName);
            }

            return {
                epgId: epgChannel?.id?.toString() || epgChannel?.identifier || matchedName,
                displayName: matchedName,
                score: percentageScore,
                epgChannel: epgChannel
            };
        })
        .filter(suggestion => suggestion.score >= this.minMatchScore)
        .slice(0, 3); // Return top 3 matches
    }

    // Find the best match (top suggestion)
    findBestMatch(streamingChannel, epgChannels) {
        const suggestions = this.findSuggestions(streamingChannel, epgChannels);
        return suggestions.length > 0 ? suggestions[0] : null;
    }

    // Check if a match is confident enough for tentative highlighting
    isTentativeMatch(streamingChannel, epgChannels) {
        const bestMatch = this.findBestMatch(streamingChannel, epgChannels);
        return bestMatch && bestMatch.score >= this.minMatchScore;
    }

    // Check if a match is confident enough for automatic mapping
    isConfidentMatch(streamingChannel, epgChannels) {
        const bestMatch = this.findBestMatch(streamingChannel, epgChannels);
        return bestMatch && bestMatch.score >= this.confidentMatchScore;
    }
}

export default EPGMappingFuzzy;