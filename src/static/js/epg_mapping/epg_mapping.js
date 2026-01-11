/**
 * EPG Mapping Main Manager
 * Orchestrates all sub-managers
 */

import EPGMappingState from './epg_mapping_state.js';
import EPGMappingDOM from './epg_mapping_dom.js';
import EPGMappingDragDrop from './epg_mapping_dragdrop.js';
import EPGMappingUI from './epg_mapping_ui.js';
import EPGMappingAPI from './epg_mapping_api.js';

class EPGMappingManager {
    constructor() {
        // Initialize sub-managers
        this.state = new EPGMappingState();
        this.dom = new EPGMappingDOM();
        this.api = new EPGMappingAPI();
        this.ui = new EPGMappingUI(this.state, this.dom);
        this.dragDrop = new EPGMappingDragDrop(this.state, this.ui, this);

        // Initialize
        this.init();
    }

    async init() {
        this.dom.initializeElements();
        this.setupEventListeners();
        this.dragDrop.setup(this.dom.elements.streamingContainer);

        await this.loadProviders();
        await this.loadEPGChannels();

        this.ui.updateStats();
    }

    setupEventListeners() {
        // Provider selection
        if (this.dom.elements.providerSelect) {
            this.dom.elements.providerSelect.addEventListener('change', (e) => {
                const providerId = e.target.value;
                if (providerId && providerId !== this.state.selectedProvider) {
                    this.state.selectedProvider = providerId;
                    this.loadStreamingChannels(providerId);
                }
            });
        }

        // Refresh providers
        if (this.dom.elements.refreshProviders) {
            this.dom.elements.refreshProviders.addEventListener('click', () => {
                this.loadProviders(true);
            });
        }

        // EPG search
        if (this.dom.elements.epgSearch) {
            this.dom.elements.epgSearch.addEventListener('input', (e) => {
                this.state.searchTerm = e.target.value.toLowerCase();
                this.ui.renderEPGChannels();
            });
        }

        // Unmap modal
        if (this.dom.elements.cancelUnmap && this.dom.elements.confirmUnmap) {
            this.dom.elements.cancelUnmap.addEventListener('click', () => {
                this.hideUnmapModal();
            });

            this.dom.elements.confirmUnmap.addEventListener('click', () => {
                this.performUnmap();
            });
        }

        // Modal backdrop click
        if (this.dom.elements.unmapModal) {
            this.dom.elements.unmapModal.addEventListener('click', (e) => {
                if (e.target === this.dom.elements.unmapModal) {
                    this.hideUnmapModal();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dom.elements.unmapModal &&
                !this.dom.elements.unmapModal.classList.contains('hidden')) {
                this.hideUnmapModal();
            }
        });
    }

    // Data loading methods
    async loadProviders(forceRefresh = false) {
        if (this.state.isLoading.providers) return;

        this.state.isLoading.providers = true;
        this.dom.elements.providerSelect.disabled = true;
        this.dom.updateText(this.dom.elements.providerSelect, 'Loading providers...');

        try {
            const data = await this.api.fetchProviders();
            const providers = data.providers?.providers || data.providers || [];

            this.state.providers = providers;
            this.state.cache.providers = providers;
            this.ui.renderProviderSelect();

            // Auto-select first provider
            if (this.state.providers.length > 0 && !this.state.selectedProvider) {
                const firstProvider = this.state.providers[0];
                this.state.selectedProvider = firstProvider.name || firstProvider.id;
                this.dom.setElementValue(this.dom.elements.providerSelect, this.state.selectedProvider);
                await this.loadStreamingChannels(this.state.selectedProvider);
            }
        } catch (error) {
            console.error('Error loading providers:', error);
            window.showToast(`Error loading providers: ${error.message}`, 'error');
            this.dom.updateText(this.dom.elements.providerSelect, 'Error loading providers');
        } finally {
            this.state.isLoading.providers = false;
            this.dom.elements.providerSelect.disabled = false;
        }
    }

    async loadStreamingChannels(providerId) {
        if (this.state.isLoading.streaming) return;

        this.state.isLoading.streaming = true;
        this.dom.showLoading(this.dom.elements.streamingContainer, this.dom.elements.streamingLoading);
        this.dom.toggleEmptyState(this.dom.elements.streamingEmpty, false);

        try {
            const data = await this.api.fetchStreamingChannels(providerId);
            const channelsData = data.channels?.channels || data.channels || [];

            this.state.streamingChannels = Array.isArray(channelsData) ? channelsData : [];
            this.updateStreamingLookup();

            await this.loadAliases();
            this.ui.renderStreamingChannels();
            this.ui.updateStats();
        } catch (error) {
            console.error('Error loading streaming channels:', error);
            window.showToast(`Error loading channels: ${error.message}`, 'error');
            this.dom.toggleEmptyState(this.dom.elements.streamingEmpty, true);
        } finally {
            this.state.isLoading.streaming = false;
            this.dom.hideLoading(this.dom.elements.streamingContainer, this.dom.elements.streamingLoading);
        }
    }

    async loadEPGChannels() {
        if (this.state.isLoading.epg) return;

        this.state.isLoading.epg = true;
        this.dom.showLoading(this.dom.elements.epgContainer, this.dom.elements.epgLoading);
        this.dom.toggleEmptyState(this.dom.elements.epgEmpty, false);

        try {
            const channelsData = await this.api.fetchEPGChannels();
            this.state.epgChannels = Array.isArray(channelsData) ? channelsData : [];
            this.updateEPGLookup();

            this.ui.renderEPGChannels();
            this.ui.updateStats();
        } catch (error) {
            console.error('Error loading EPG channels:', error);
            window.showToast(`Error loading EPG channels: ${error.message}`, 'error');
            this.dom.toggleEmptyState(this.dom.elements.epgEmpty, true);
        } finally {
            this.state.isLoading.epg = false;
            this.dom.hideLoading(this.dom.elements.epgContainer, this.dom.elements.epgLoading);
        }
    }

    async loadAliases() {
        try {
            this.state.aliases.clear();
            this.state.channelLookup.aliasToStreaming.clear();

            // Try bulk endpoint first
            const bulkAliases = await this.api.fetchAliases();
            if (bulkAliases?.aliases) {
                this.processBulkAliases(bulkAliases.aliases);
                return;
            }

            // Fallback to individual requests
            await this.loadAliasesFallback();
        } catch (error) {
            console.error('Error loading aliases:', error);
        }
    }

    // Core mapping functionality
    async handleMapping(streamingId) {
        if (!this.state.currentMapping || !this.state.currentMapping.epgId) {
            window.showToast('Please select an EPG channel to map', 'warning');
            return;
        }

        const epgId = this.state.currentMapping.epgId;
        const streamingChannel = this.state.channelLookup.streaming.get(streamingId);
        const streamingName = streamingChannel?.Name || streamingChannel?.name || streamingId;

        const epgDisplayName = this.state.currentMapping.epgDisplayName || 'Unknown';
        const epgTechName = this.state.currentMapping.epgTechName || epgId;
        const epgFullName = `${epgDisplayName} (${epgTechName})`;

        // Check for existing mapping
        const existingAlias = this.state.getAliasInfo(streamingId);
        if (existingAlias) {
            if (!await this.confirmOverwriteMapping(existingAlias, streamingName, epgFullName)) {
                return;
            }
            await this.deleteAlias(existingAlias.aliasId, streamingId);
        }

        // Create new alias
        await this.createMapping(streamingId, epgId, streamingName, epgFullName);
    }

    async createMapping(streamingId, epgId, streamingName, epgFullName) {
        this.state.isLoading.mapping = true;
        this.ui.updateStatus(`Mapping ${epgFullName} to ${streamingName}...`);

        try {
            const data = await this.api.createAlias(epgId, streamingId, 'ultimate_backend');
            const epgChannel = this.state.channelLookup.epg.get(epgId);

            this.state.addAlias(streamingId, {
                aliasId: data.alias?.id,
                epgChannelId: epgId,
                alias: streamingId,
                epgChannelName: epgChannel?.display_name || this.state.currentMapping.epgDisplayName,
                epgTechName: epgChannel?.name || this.state.currentMapping.epgTechName,
                aliasType: 'ultimate_backend'
            });

            window.showToast(`Successfully mapped ${streamingName} to ${epgFullName}`, 'success');
            this.refreshUI();
            this.state.currentMapping = null;
        } catch (error) {
            console.error('Error creating alias:', error);
            window.showToast(`Error creating mapping: ${error.message}`, 'error');
        } finally {
            this.state.isLoading.mapping = false;
            this.ui.updateStatus('Ready');
        }
    }

    // Modal management
    showUnmapModal(streamingId, streamingName) {
        const aliasInfo = this.state.getAliasInfo(streamingId);
        if (!aliasInfo) return;

        const epgChannel = this.state.channelLookup.epg.get(aliasInfo.epgChannelId);
        const epgDisplayName = epgChannel?.display_name || aliasInfo.epgChannelName || 'Unknown';
        const epgTechName = epgChannel?.name || aliasInfo.epgTechName || aliasInfo.epgChannelId;
        const epgFullName = `${epgDisplayName} (${epgTechName})`;

        const modalText = document.querySelector('#unmap-modal .modal-content p');
        if (modalText) {
            modalText.textContent = `Are you sure you want to unmap "${streamingName}" from "${epgFullName}"?`;
        }

        this.state.pendingUnmap = { streamingId, aliasInfo, streamingName, epgFullName };
        this.dom.toggleElementVisibility(this.dom.elements.unmapModal, true);
    }

    hideUnmapModal() {
        this.dom.toggleElementVisibility(this.dom.elements.unmapModal, false);
        this.state.pendingUnmap = null;
    }

    async performUnmap() {
        if (!this.state.pendingUnmap) return;

        const { streamingId, aliasInfo, streamingName, epgFullName } = this.state.pendingUnmap;
        this.state.isLoading.mapping = true;
        this.ui.updateStatus(`Unmapping ${streamingName} from ${epgFullName}...`);

        try {
            await this.deleteAlias(aliasInfo.aliasId, streamingId);
            window.showToast(`Successfully unmapped ${streamingName} from ${epgFullName}`, 'success');
            this.refreshUI();
        } catch (error) {
            console.error('Error unmapping:', error);
            window.showToast(`Error unmapping: ${error.message}`, 'error');
        } finally {
            this.state.isLoading.mapping = false;
            this.ui.updateStatus('Ready');
            this.hideUnmapModal();
        }
    }

    // Helper methods
    updateStreamingLookup() {
        this.state.channelLookup.streaming.clear();
        this.state.streamingChannels.forEach(channel => {
            const channelId = channel.Id || channel.channel_id || channel.id || channel.name;
            if (channelId) {
                this.state.channelLookup.streaming.set(channelId, channel);
            }
        });
    }

    updateEPGLookup() {
        this.state.channelLookup.epg.clear();
        this.state.epgChannels.forEach(channel => {
            const channelId = channel.id?.toString() || channel.identifier || channel.name;
            if (channelId) {
                this.state.channelLookup.epg.set(channelId, channel);
            }
        });
    }

    processBulkAliases(aliases) {
        aliases.forEach(alias => {
            if (alias.alias) {
                this.state.addAlias(alias.alias, {
                    aliasId: alias.id,
                    epgChannelId: alias.channel_id,
                    alias: alias.alias,
                    epgChannelName: alias.channel_display_name || `Channel ${alias.channel_id}`,
                    epgTechName: alias.channel_name || alias.channel_id.toString(),
                    aliasType: alias.alias_type,
                    createdAt: alias.created_at
                });
            }
        });
    }

    async loadAliasesFallback() {
        // Implementation for fallback alias loading
        console.warn('Using fallback alias loading method');
        // ... (your existing fallback logic)
    }

    async confirmOverwriteMapping(existingAlias, streamingName, newEPGFullName) {
        const existingEPG = this.state.channelLookup.epg.get(existingAlias.epgChannelId);
        const existingDisplayName = existingEPG?.display_name || existingAlias.epgChannelName || 'Unknown';
        const existingTechName = existingEPG?.name || existingAlias.epgChannelId;
        const existingFullName = `${existingDisplayName} (${existingTechName})`;

        return confirm(
            `Channel "${streamingName}" is already mapped to:\n${existingFullName}\n\n` +
            `Do you want to replace it with:\n${newEPGFullName}?`
        );
    }

    async deleteAlias(aliasId, streamingId) {
        const success = await this.api.deleteAlias(aliasId);
        if (success) {
            this.state.removeAlias(streamingId);
        }
        return success;
    }

    refreshUI() {
        this.ui.renderStreamingChannels();
        this.ui.renderEPGChannels();
        this.ui.updateStats();
    }
}

// Export for use
export default EPGMappingManager;