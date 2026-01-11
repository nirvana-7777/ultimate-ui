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
        // State
        this.state = new EPGMappingState();
        this.dom = new EPGMappingDOM();
        this.api = new EPGMappingAPI();
        this.ui = new EPGMappingUI(this.state, this.dom);
        this.dragDrop = new EPGMappingDragDrop(this.state, this.ui, this);

        // Don't initialize here - wait for DOM to be fully ready
        // this.init();
    }

    async init() {
        // Check if we're in the right page (EPG mapping page)
        if (!document.getElementById('provider-select')) {
            console.warn('Not on EPG mapping page, skipping initialization');
            return;
        }

        this.dom.initializeElements();
        this.setupEventListeners();

        // Only setup drag & drop if container exists
        if (this.dom.elements.streamingContainer) {
            this.dragDrop.setup(this.dom.elements.streamingContainer);
        }

        await this.loadProviders();
        await this.loadEPGChannels();

        // Update UI
        this.ui.updateStats();
    }


    setupEventListeners() {
        // Provider selection - WITH NULL CHECK
        if (this.dom.elements.providerSelect) {
            this.dom.elements.providerSelect.addEventListener('change', (e) => {
                const providerId = e.target.value;
                if (providerId && providerId !== this.state.selectedProvider) {
                    this.state.selectedProvider = providerId;
                    this.loadStreamingChannels(providerId);
                }
            });
        }

        // Refresh providers button - WITH NULL CHECK
        if (this.dom.elements.refreshProviders) {
            this.dom.elements.refreshProviders.addEventListener('click', () => {
                this.loadProviders(true); // Force refresh
            });
        }

        // EPG search - WITH NULL CHECK
        if (this.dom.elements.epgSearch) {
            this.dom.elements.epgSearch.addEventListener('input', (e) => {
                this.state.searchTerm = e.target.value.toLowerCase();
                this.ui.renderEPGChannels();
            });
        }

        // Unmap modal - only if elements exist
        if (this.dom.elements.cancelUnmap && this.dom.elements.confirmUnmap) {
            this.dom.elements.cancelUnmap.addEventListener('click', () => {
                this.hideUnmapModal();
            });

            this.dom.elements.confirmUnmap.addEventListener('click', () => {
                this.performUnmap();
            });
        }

        // Close modal on backdrop click
        if (this.dom.elements.unmapModal) {
            this.dom.elements.unmapModal.addEventListener('click', (e) => {
                if (e.target === this.dom.elements.unmapModal) {
                    this.hideUnmapModal();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.dom.elements.unmapModal && !this.dom.elements.unmapModal.classList.contains('hidden')) {
                    this.hideUnmapModal();
                }
            }
        });
    }

    // Data loading methods
    async loadProviders(forceRefresh = false) {
        if (this.state.isLoading.providers) return;

        this.state.isLoading.providers = true;

        // ADDED: Null-safe DOM manipulation
        if (this.dom.elements.providerSelect) {
            this.dom.elements.providerSelect.disabled = true;
            this.dom.updateInnerHTML(this.dom.elements.providerSelect, '<option value="" disabled selected>Loading providers...</option>');
        }

        try {
            const response = await fetch('/api/mapping/providers');
            const data = await response.json();

            if (data.success) {
                // Fix: Handle the actual response structure
                // The providers are in data.providers.providers (not data.providers)
                const providers = data.providers?.providers || data.providers || [];
                this.state.providers = providers;
                this.state.cache.providers = providers;
                this.ui.renderProviderSelect();

                // Auto-select first provider if none selected
                if (this.state.providers.length > 0 && !this.state.selectedProvider) {
                    const firstProvider = this.state.providers[0];
                    this.state.selectedProvider = firstProvider.name || firstProvider.id;
                    if (this.dom.elements.providerSelect) {
                        this.dom.elements.providerSelect.value = this.state.selectedProvider;
                    }
                    await this.loadStreamingChannels(this.state.selectedProvider);
                }
            } else {
                throw new Error(data.error || 'Failed to load providers');
            }
        } catch (error) {
            console.error('Error loading providers:', error);
            window.showToast(`Error loading providers: ${error.message}`, 'error');

            // Show error in dropdown - ADDED: Null check
            if (this.dom.elements.providerSelect) {
                this.dom.updateInnerHTML(this.dom.elements.providerSelect, '<option value="" disabled selected>Error loading providers</option>');
            }
        } finally {
            this.state.isLoading.providers = false;

            // ADDED: Null check before setting disabled
            if (this.dom.elements.providerSelect) {
                this.dom.elements.providerSelect.disabled = false;
            }
        }
    }

    async loadStreamingChannels(providerId) {
        if (this.state.isLoading.streaming) return;

        this.state.isLoading.streaming = true;

        // WITH NULL CHECKS for all DOM elements
        if (this.dom.elements.streamingContainer && this.dom.elements.streamingLoading) {
            this.dom.showLoading(this.dom.elements.streamingContainer, this.dom.elements.streamingLoading);
        }

        if (this.dom.elements.streamingEmpty) {
            this.dom.elements.streamingEmpty.classList.add('hidden');
        }

        try {
            const response = await fetch(`/api/mapping/channels/${providerId}`);
            const data = await response.json();

            if (data.success) {
                // Fix: Handle nested channels structure
                const channelsData = data.channels?.channels || data.channels || [];
                this.state.streamingChannels = Array.isArray(channelsData) ? channelsData : [];

                // Update lookup
                this.state.channelLookup.streaming.clear();
                this.state.streamingChannels.forEach(channel => {
                    const channelId = channel.Id || channel.channel_id || channel.id || channel.name;
                    if (channelId) {
                        this.state.channelLookup.streaming.set(channelId, channel);
                    }
                });

                // Load aliases for these channels using new bulk endpoint
                await this.loadAliases();

                // Render channels
                this.ui.renderStreamingChannels();

                // Update stats
                this.ui.updateStats();
            } else {
                throw new Error(data.error || 'Failed to load channels');
            }
        } catch (error) {
            console.error('Error loading streaming channels:', error);
            window.showToast(`Error loading channels: ${error.message}`, 'error');

            // Show empty state - WITH NULL CHECK
            if (this.dom.elements.streamingEmpty) {
                this.dom.elements.streamingEmpty.classList.remove('hidden');
            }

            // Clear container - WITH NULL CHECK
            if (this.dom.elements.streamingContainer) {
                this.dom.elements.streamingContainer.innerHTML = '';
            }
        } finally {
            this.state.isLoading.streaming = false;

            // WITH NULL CHECKS for all DOM elements
            if (this.dom.elements.streamingContainer && this.dom.elements.streamingLoading) {
                this.dom.hideLoading(this.dom.elements.streamingContainer, this.dom.elements.streamingLoading);
            }
        }
    }

    async loadEPGChannels() {
        if (this.state.isLoading.epg) return;

        this.state.isLoading.epg = true;

        // WITH NULL CHECKS for all DOM elements
        if (this.dom.elements.epgContainer && this.dom.elements.epgLoading) {
            this.dom.showLoading(this.dom.elements.epgContainer, this.dom.elements.epgLoading);
        }

        if (this.dom.elements.epgEmpty) {
            this.dom.elements.epgEmpty.classList.add('hidden');
        }

        try {
            // Get all EPG channels
            const response = await fetch('/api/channels');
            const channelsData = await response.json();

            if (Array.isArray(channelsData)) {
                this.state.epgChannels = channelsData;
                this.state.cache.epgChannels = channelsData;
            } else {
                this.state.epgChannels = [];
            }

            // Update lookup
            this.state.channelLookup.epg.clear();
            this.state.epgChannels.forEach(channel => {
                const channelId = channel.id?.toString() || channel.identifier || channel.name;
                if (channelId) {
                    this.state.channelLookup.epg.set(channelId, channel);
                }
            });

            // Render channels
            this.ui.renderEPGChannels();

            // Update stats
            this.ui.updateStats();

        } catch (error) {
            console.error('Error loading EPG channels:', error);
            window.showToast(`Error loading EPG channels: ${error.message}`, 'error');

            // Show empty state - WITH NULL CHECK
            if (this.dom.elements.epgEmpty) {
                this.dom.elements.epgEmpty.classList.remove('hidden');
            }

            // Clear container - WITH NULL CHECK
            if (this.dom.elements.epgContainer) {
                this.dom.elements.epgContainer.innerHTML = '';
            }
        } finally {
            this.state.isLoading.epg = false;

            // WITH NULL CHECKS for all DOM elements
            if (this.dom.elements.epgContainer && this.dom.elements.epgLoading) {
                this.dom.hideLoading(this.dom.elements.epgContainer, this.dom.elements.epgLoading);
            }
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