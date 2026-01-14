/**
 * EPG Mapping UI Manager
 * Handles all UI rendering operations
 */

class EPGMappingUI {
    constructor(stateManager, domManager, suggestionsManager) {
        this.state = stateManager;
        this.dom = domManager;
        this.suggestions = suggestionsManager;
    }

    // Provider UI
    renderProviderSelect() {
        const select = this.dom.elements.providerSelect;
        if (!select) return;

        select.innerHTML = '';

        if (this.state.providers.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No providers available</option>';
            return;
        }

        this.state.providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.name || provider.id;
            option.textContent = provider.label || provider.name;
            option.selected = (provider.name || provider.id) === this.state.selectedProvider;
            select.appendChild(option);
        });
    }

    // Channel cards
    renderStreamingChannels() {
        const container = this.dom.elements.streamingContainer;
        if (!container) return;

        container.innerHTML = '';

        if (!this.state.streamingChannels || this.state.streamingChannels.length === 0) {
            this.dom.toggleEmptyState(this.dom.elements.streamingEmpty, true);
            return;
        }

        this.dom.toggleEmptyState(this.dom.elements.streamingEmpty, false);

        this.state.streamingChannels.forEach(channel => {
            const card = this.createChannelCard(channel, 'streaming');
            container.appendChild(card);
        });
    }

    renderEPGChannels() {
        const container = this.dom.elements.epgContainer;
        if (!container) return;

        container.innerHTML = '';

        const filteredChannels = this.state.filteredEPGChannels;

        if (filteredChannels.length === 0) {
            this.dom.toggleEmptyState(this.dom.elements.epgEmpty, true);
            this.dom.updateText(this.dom.elements.epgCount, '0');
            return;
        }

        this.dom.toggleEmptyState(this.dom.elements.epgEmpty, false);
        this.dom.updateText(this.dom.elements.epgCount, filteredChannels.length.toString());

        filteredChannels.forEach(channel => {
            const card = this.createChannelCard(channel, 'epg');
            container.appendChild(card);
        });
    }

    createChannelCard(channel, type) {
        const card = document.createElement('div');
        card.className = 'channel-card';

        // Set channel ID
        const channelId = this.getChannelId(channel, type);
        card.dataset.channelId = channelId;
        card.dataset.channelType = type;

        // Check if mapped
        const isMapped = type === 'streaming' && this.state.isChannelMapped(channelId);

        // Check if has tentative match (only for streaming channels)
        const hasTentative = type === 'streaming' && this.suggestions.hasTentativeMatch(channelId) && !isMapped;

        if (isMapped) {
            card.classList.add('mapped', 'new');
        } else if (hasTentative) {
            card.classList.add('tentative');

            // Add tooltip with suggestion info
            const suggestion = this.suggestions.getSuggestion(channelId);
            if (suggestion) {
                card.title = `Suggested match: ${suggestion.displayName} (${suggestion.score}% match)\nClick to confirm`;
            }
        }

        // Build card content
        card.appendChild(this.createChannelLogo(channel, type));
        card.appendChild(this.createChannelInfo(channel, type, channelId, isMapped, hasTentative));

        // Add unmap button for mapped channels
        if (type === 'streaming' && isMapped) {
            card.appendChild(this.createUnmapButton(channelId, channel));
        }

        // Add suggestion info for tentative matches
        if (type === 'streaming' && hasTentative && !isMapped) {
            const suggestionInfo = this.createSuggestionInfo(channelId);
            if (suggestionInfo) {
                const infoDiv = card.querySelector('.channel-info');
                if (infoDiv) {
                    infoDiv.appendChild(suggestionInfo);
                }
            }

            // Add tentative indicator
            const indicator = document.createElement('div');
            indicator.className = 'tentative-indicator';
            indicator.title = 'Tentative match - click to confirm';
            card.appendChild(indicator);
        }

        // Make EPG channels draggable
        if (type === 'epg') {
            card.draggable = true;
            card.title = 'Drag to map onto a streaming channel';
        } else if (hasTentative && !isMapped) {
            card.style.cursor = 'pointer';
            // Title already set above
        } else {
            card.title = 'Drop EPG channel here to map';
        }

        // Remove animation class
        if (card.classList.contains('new')) {
            setTimeout(() => card.classList.remove('new'), 2000);
        }

        return card;
    }

    createSuggestionInfo(streamingId) {
        const suggestion = this.suggestions.getSuggestion(streamingId);
        if (!suggestion) return null;

        const suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'channel-suggestion';

        const matchText = document.createElement('div');
        matchText.className = 'suggestion-match';
        matchText.textContent = `Suggested: ${suggestion.displayName}`;

        const confidenceText = document.createElement('div');
        confidenceText.className = 'suggestion-confidence';
        confidenceText.textContent = `${suggestion.score}% match`;

        suggestionDiv.appendChild(matchText);
        suggestionDiv.appendChild(confidenceText);

        return suggestionDiv;
    }

    // Helper methods for card creation
    getChannelId(channel, type) {
        if (type === 'streaming') {
            return channel.Id || channel.channel_id || channel.id || channel.name;
        }
        return channel.id?.toString() || channel.identifier || channel.name;
    }

    createChannelLogo(channel, type) {
        const logoDiv = document.createElement('div');
        logoDiv.className = 'channel-logo';

        const logoUrl = channel.LogoUrl || channel.logo || channel.logo_url || channel.icon_url || '';

        if (logoUrl) {
            logoDiv.style.backgroundImage = `url(${logoUrl})`;
            logoDiv.style.backgroundSize = 'cover';
            logoDiv.style.backgroundPosition = 'center';
        } else {
            const channelName = type === 'streaming'
                ? channel.Name || channel.name
                : channel.display_name || channel.name;
            const fallbackText = channelName ? channelName.charAt(0).toUpperCase() : '?';

            logoDiv.classList.add('channel-logo-fallback');
            logoDiv.textContent = fallbackText;
        }

        return logoDiv;
    }

    createChannelInfo(channel, type, channelId, isMapped, _hasTentative = false) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'channel-info';

        // Name
        const nameDiv = document.createElement('div');
        nameDiv.className = 'channel-name';
        nameDiv.textContent = this.getChannelDisplayName(channel, type, channelId);
        infoDiv.appendChild(nameDiv);

        // ID/Technical name
        const idDiv = document.createElement('div');
        idDiv.className = 'channel-id';
        idDiv.textContent = type === 'streaming' ? channelId : (channel.name || channelId);
        infoDiv.appendChild(idDiv);

        // Mapping info for streaming channels
        if (type === 'streaming' && isMapped) {
            const mappingInfo = this.createMappingInfo(channelId);
            if (mappingInfo) infoDiv.appendChild(mappingInfo);
        }

        return infoDiv;
    }

    createMappingInfo(streamingId) {
        const aliasInfo = this.state.getAliasInfo(streamingId);
        if (!aliasInfo) return null;

        const epgChannel = this.state.channelLookup.epg.get(aliasInfo.epgChannelId);
        const displayText = this.formatMappingDisplayText(epgChannel, aliasInfo);
        const tooltipText = `EPG ID: ${aliasInfo.epgChannelId}`;

        const mappingDiv = document.createElement('div');
        mappingDiv.className = 'channel-mapping';
        mappingDiv.textContent = displayText;
        mappingDiv.title = tooltipText;

        return mappingDiv;
    }

    formatMappingDisplayText(epgChannel, aliasInfo) {
        if (epgChannel) {
            const displayName = epgChannel.display_name || 'Unknown';
            const techName = epgChannel.name || aliasInfo.epgChannelId;
            return `Linked to: ${displayName} (${techName})`;
        } else if (aliasInfo.epgChannelName) {
            const techName = aliasInfo.epgTechName || aliasInfo.epgChannelId;
            return `Linked to: ${aliasInfo.epgChannelName} (${techName})`;
        }
        return `Linked to: Channel ${aliasInfo.epgChannelId}`;
    }

    createUnmapButton(channelId, channel) {
        const button = document.createElement('button');
        button.className = 'unmap-btn';
        button.innerHTML = '×';
        button.title = 'Unmap channel';

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const channelName = channel.Name || channel.name || channelId;
            // This would be handled by the main manager
            if (window.epgMappingManager) {
                window.epgMappingManager.showUnmapModal(channelId, channelName);
            }
        });

        return button;
    }

    getChannelDisplayName(channel, type, channelId) {
        if (type === 'streaming') {
            return channel.Name || channel.name || channelId;
        }
        return channel.display_name || channel.name || channelId;
    }

    // Stats and status
    updateStats() {
        // Streaming channel count
        const streamingCount = this.state.streamingChannels?.length || 0;
        this.dom.updateText(this.dom.elements.streamingCount, streamingCount.toString());

        // EPG channel count
        const epgCount = this.state.epgChannels?.length || 0;
        this.dom.updateText(this.dom.elements.epgTotalCount, epgCount.toString());

        // Mapped count
        const mappedCount = this.state.mappedCount || 0;
        this.dom.updateText(this.dom.elements.mappedCount, mappedCount.toString());

        // Update tentative count if we have that element
        const tentativeElement = document.getElementById('tentative-count');
        if (tentativeElement) {
            const tentativeCount = this.state.stats?.tentative || this.suggestions.getTentativeCount();
            this.dom.updateText(tentativeElement, tentativeCount.toString());
        }
    }

    updateStatus(message) {
        if (this.dom.elements.mappingStatus) {
            this.dom.elements.mappingStatus.textContent = message;
        }
    }
}

export default EPGMappingUI;