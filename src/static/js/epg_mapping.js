/**
 * EPG Mapping Manager
 * Handles drag-and-drop mapping between Ultimate Backend channels and EPG channels
 */

class EPGMappingManager {
    constructor() {
        // State
        this.state = {
            providers: [],
            selectedProvider: null,
            streamingChannels: [],
            epgChannels: [],
            aliases: new Map(), // Map of streaming channel ID -> alias data
            currentMapping: null, // { streamingId, epgId } for drag operation
            searchTerm: '',
            isLoading: {
                providers: false,
                streaming: false,
                epg: false,
                mapping: false
            }
        };

        // Cache for better performance
        this.cache = {
            providers: null,
            epgChannels: null,
            aliases: null
        };

        // DOM Elements - will be initialized in init()
        this.elements = {};

        // Channel lookup maps
        this.channelLookup = {
            streaming: new Map(), // streamingId -> channel data
            epg: new Map(), // epgId -> channel data
            aliasToStreaming: new Map() // alias -> streamingId
        };

        // Initialize
        this.init();
    }

    async init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupDragAndDrop();
        await this.loadProviders();

        // Load EPG channels (independent of provider)
        await this.loadEPGChannels();

        // Update UI
        this.updateStats();
    }

    initializeElements() {
        // Get all DOM elements safely
        this.elements = {
            providerSelect: document.getElementById('provider-select'),
            refreshProviders: document.getElementById('refresh-providers'),
            streamingContainer: document.getElementById('streaming-channels-container'),
            streamingLoading: document.getElementById('streaming-loading'),
            streamingEmpty: document.getElementById('streaming-empty'),
            epgContainer: document.getElementById('epg-channels-container'),
            epgLoading: document.getElementById('epg-loading'),
            epgEmpty: document.getElementById('epg-empty'),
            epgSearch: document.getElementById('epg-search'),
            epgCount: document.getElementById('epg-count'),
            epgTotalCount: document.getElementById('epg-total-count'),
            streamingCount: document.getElementById('streaming-count'),
            mappedCount: document.getElementById('mapped-count'),
            mappingStatus: document.getElementById('mapping-status'),
            unmapModal: document.getElementById('unmap-modal'),
            cancelUnmap: document.getElementById('cancel-unmap'),
            confirmUnmap: document.getElementById('confirm-unmap'),
            mappingTooltip: document.getElementById('mapping-tooltip')
        };
    }

    setupEventListeners() {
        // Provider selection
        if (this.elements.providerSelect) {
            this.elements.providerSelect.addEventListener('change', (e) => {
                const providerId = e.target.value;
                if (providerId && providerId !== this.state.selectedProvider) {
                    this.state.selectedProvider = providerId;
                    this.loadStreamingChannels(providerId);
                }
            });
        }

        // Refresh providers button
        if (this.elements.refreshProviders) {
            this.elements.refreshProviders.addEventListener('click', () => {
                this.loadProviders(true); // Force refresh
            });
        }

        // EPG search
        if (this.elements.epgSearch) {
            this.elements.epgSearch.addEventListener('input', (e) => {
                this.state.searchTerm = e.target.value.toLowerCase();
                this.renderEPGChannels();
            });
        }

        // Unmap modal - only if elements exist
        if (this.elements.cancelUnmap && this.elements.confirmUnmap) {
            this.elements.cancelUnmap.addEventListener('click', () => {
                this.hideUnmapModal();
            });

            this.elements.confirmUnmap.addEventListener('click', () => {
                this.performUnmap();
            });
        }

        // Close modal on backdrop click
        if (this.elements.unmapModal) {
            this.elements.unmapModal.addEventListener('click', (e) => {
                if (e.target === this.elements.unmapModal) {
                    this.hideUnmapModal();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.elements.unmapModal && !this.elements.unmapModal.classList.contains('hidden')) {
                    this.hideUnmapModal();
                }
            }
        });
    }

    setupDragAndDrop() {
        // Prevent default drag behaviors
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('channel-card')) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', '');

                // Add dragging class to source element
                e.target.classList.add('dragging');

                // Store mapping data
                const channelId = e.target.dataset.channelId;
                const channelType = e.target.dataset.channelType;

                if (channelType === 'epg') {
                    const epgChannel = this.channelLookup.epg.get(channelId);
                    if (epgChannel) {
                        this.state.currentMapping = {
                            epgId: channelId,
                            epgName: epgChannel.display_name || epgChannel.name
                        };
                    }
                }
            }
        });

        document.addEventListener('dragend', (e) => {
            // Remove dragging class
            document.querySelectorAll('.channel-card.dragging').forEach(card => {
                card.classList.remove('dragging');
            });

            // Remove drag-over classes
            document.querySelectorAll('.channel-card.drag-over').forEach(card => {
                card.classList.remove('drag-over');
            });

            // Clear current mapping
            this.state.currentMapping = null;
        });

        // Streaming channel drop zones
        document.addEventListener('dragover', (e) => {
            if (this.state.currentMapping && e.target.classList.contains('channel-card')) {
                const card = e.target.closest('.channel-card');
                if (card && card.dataset.channelType === 'streaming') {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }
        });

        document.addEventListener('dragenter', (e) => {
            if (this.state.currentMapping && e.target.classList.contains('channel-card')) {
                const card = e.target.closest('.channel-card');
                if (card && card.dataset.channelType === 'streaming') {
                    card.classList.add('drag-over');
                }
            }
        });

        document.addEventListener('dragleave', (e) => {
            if (e.target.classList.contains('channel-card')) {
                const card = e.target.closest('.channel-card');
                if (card && card.classList.contains('drag-over')) {
                    card.classList.remove('drag-over');
                }
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();

            if (!this.state.currentMapping) return;

            const card = e.target.closest('.channel-card');
            if (card && card.dataset.channelType === 'streaming') {
                card.classList.remove('drag-over');

                const streamingId = card.dataset.channelId;
                const streamingChannel = this.channelLookup.streaming.get(streamingId);

                if (streamingChannel) {
                    this.handleMapping(streamingId, streamingChannel.name);
                }
            }
        });
    }

    async loadProviders(forceRefresh = false) {
        if (this.state.isLoading.providers) return;

        this.state.isLoading.providers = true;
        if (this.elements.providerSelect) {
            this.elements.providerSelect.disabled = true;
            this.elements.providerSelect.innerHTML = '<option value="" disabled selected>Loading providers...</option>';
        }

        try {
            const response = await fetch('/api/mapping/providers');
            const data = await response.json();

            if (data.success) {
                // Fix: Handle the actual response structure
                // The providers are in data.providers.providers (not data.providers)
                const providers = data.providers?.providers || data.providers || [];
                this.state.providers = providers;
                this.cache.providers = providers;
                this.renderProviderSelect();

                // Auto-select first provider if none selected
                if (this.state.providers.length > 0 && !this.state.selectedProvider) {
                    const firstProvider = this.state.providers[0];
                    this.state.selectedProvider = firstProvider.name || firstProvider.id;
                    if (this.elements.providerSelect) {
                        this.elements.providerSelect.value = this.state.selectedProvider;
                    }
                    await this.loadStreamingChannels(this.state.selectedProvider);
                }
            } else {
                throw new Error(data.error || 'Failed to load providers');
            }
        } catch (error) {
            console.error('Error loading providers:', error);
            window.showToast(`Error loading providers: ${error.message}`, 'error');

            // Show error in dropdown
            if (this.elements.providerSelect) {
                this.elements.providerSelect.innerHTML = '<option value="" disabled selected>Error loading providers</option>';
            }
        } finally {
            this.state.isLoading.providers = false;
            if (this.elements.providerSelect) {
                this.elements.providerSelect.disabled = false;
            }
        }
    }

    renderProviderSelect() {
        const select = this.elements.providerSelect;
        if (!select) return;

        select.innerHTML = '';

        if (this.state.providers.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No providers available</option>';
            return;
        }

        // Add options
        this.state.providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.name || provider.id;
            option.textContent = provider.label || provider.name;
            option.selected = (provider.name || provider.id) === this.state.selectedProvider;
            select.appendChild(option);
        });
    }

    async loadStreamingChannels(providerId) {
        if (this.state.isLoading.streaming) return;

        this.state.isLoading.streaming = true;
        this.showLoading(this.elements.streamingContainer, this.elements.streamingLoading);
        if (this.elements.streamingEmpty) {
            this.elements.streamingEmpty.classList.add('hidden');
        }

        try {
            const response = await fetch(`/api/mapping/channels/${providerId}`);
            const data = await response.json();

            if (data.success) {
                this.state.streamingChannels = data.channels || [];

                // Update lookup
                this.channelLookup.streaming.clear();
                this.state.streamingChannels.forEach(channel => {
                    const channelId = channel.channel_id || channel.id || channel.name;
                    if (channelId) {
                        this.channelLookup.streaming.set(channelId, channel);
                    }
                });

                // Load aliases for these channels
                await this.loadAliases();

                // Render channels
                this.renderStreamingChannels();

                // Update stats
                this.updateStats();
            } else {
                throw new Error(data.error || 'Failed to load channels');
            }
        } catch (error) {
            console.error('Error loading streaming channels:', error);
            window.showToast(`Error loading channels: ${error.message}`, 'error');

            // Show empty state
            if (this.elements.streamingEmpty) {
                this.elements.streamingEmpty.classList.remove('hidden');
            }
            if (this.elements.streamingContainer) {
                this.elements.streamingContainer.innerHTML = '';
            }
        } finally {
            this.state.isLoading.streaming = false;
            this.hideLoading(this.elements.streamingContainer, this.elements.streamingLoading);
        }
    }

    async loadEPGChannels() {
        if (this.state.isLoading.epg) return;

        this.state.isLoading.epg = true;
        this.showLoading(this.elements.epgContainer, this.elements.epgLoading);
        if (this.elements.epgEmpty) {
            this.elements.epgEmpty.classList.add('hidden');
        }

        try {
            // Get all EPG channels
            const response = await fetch('/api/channels');
            const channelsData = await response.json();

            if (Array.isArray(channelsData)) {
                this.state.epgChannels = channelsData;
                this.cache.epgChannels = channelsData;
            } else {
                this.state.epgChannels = [];
            }

            // Update lookup
            this.channelLookup.epg.clear();
            this.state.epgChannels.forEach(channel => {
                const channelId = channel.id?.toString() || channel.identifier || channel.name;
                if (channelId) {
                    this.channelLookup.epg.set(channelId, channel);
                }
            });

            // Render channels
            this.renderEPGChannels();

            // Update stats
            this.updateStats();

        } catch (error) {
            console.error('Error loading EPG channels:', error);
            window.showToast(`Error loading EPG channels: ${error.message}`, 'error');

            // Show empty state
            if (this.elements.epgEmpty) {
                this.elements.epgEmpty.classList.remove('hidden');
            }
            if (this.elements.epgContainer) {
                this.elements.epgContainer.innerHTML = '';
            }
        } finally {
            this.state.isLoading.epg = false;
            this.hideLoading(this.elements.epgContainer, this.elements.epgLoading);
        }
    }

    async loadAliases() {
        try {
            // Clear existing aliases
            this.state.aliases.clear();
            this.channelLookup.aliasToStreaming.clear();

            // Load all aliases from WebEPG
            // We need to get all channels and check their aliases
            // This is inefficient but works for now
            for (const [streamingId, streamingChannel] of this.channelLookup.streaming) {
                try {
                    // Try to get the EPG channel that has this streamingId as an alias
                    // We'll check all EPG channels
                    for (const [epgId, epgChannel] of this.channelLookup.epg) {
                        // Check if this EPG channel has aliases
                        try {
                            const aliasesResponse = await fetch(`/api/channels/${epgId}/aliases`);
                            const aliasesData = await aliasesResponse.json();

                            if (Array.isArray(aliasesData)) {
                                const foundAlias = aliasesData.find(alias =>
                                    alias.alias === streamingId
                                );

                                if (foundAlias) {
                                    this.state.aliases.set(streamingId, {
                                        aliasId: foundAlias.id,
                                        epgChannelId: epgId,
                                        alias: streamingId,
                                        epgChannelName: epgChannel.display_name || epgChannel.name
                                    });

                                    this.channelLookup.aliasToStreaming.set(epgId, streamingId);
                                    break; // Found mapping, move to next streaming channel
                                }
                            }
                        } catch (err) {
                            // EPG channel might not have aliases endpoint
                            continue;
                        }
                    }
                } catch (error) {
                    // Silently fail - channel might not have aliases
                    console.debug(`Error checking aliases for channel ${streamingId}:`, error.message);
                }
            }

        } catch (error) {
            console.error('Error loading aliases:', error);
            // Don't show toast - this is a background operation
        }
    }

    renderStreamingChannels() {
        const container = this.elements.streamingContainer;
        if (!container) return;

        container.innerHTML = '';

        if (this.state.streamingChannels.length === 0) {
            if (this.elements.streamingEmpty) {
                this.elements.streamingEmpty.classList.remove('hidden');
            }
            return;
        }

        if (this.elements.streamingEmpty) {
            this.elements.streamingEmpty.classList.add('hidden');
        }

        this.state.streamingChannels.forEach(channel => {
            const channelId = channel.channel_id || channel.id || channel.name;
            if (!channelId) return;

            const card = this.createChannelCard(channel, 'streaming');
            container.appendChild(card);
        });
    }

    renderEPGChannels() {
        const container = this.elements.epgContainer;
        if (!container) return;

        container.innerHTML = '';

        // Filter EPG channels based on search
        let filteredChannels = this.state.epgChannels;

        if (this.state.searchTerm) {
            filteredChannels = this.state.epgChannels.filter(channel => {
                const displayName = channel.display_name || '';
                const name = channel.name || '';
                const id = channel.id?.toString() || channel.identifier || '';

                return displayName.toLowerCase().includes(this.state.searchTerm) ||
                       name.toLowerCase().includes(this.state.searchTerm) ||
                       id.toLowerCase().includes(this.state.searchTerm);
            });
        }

        // Show empty state if no channels
        if (filteredChannels.length === 0) {
            if (this.elements.epgEmpty) {
                this.elements.epgEmpty.classList.remove('hidden');
            }
            if (this.elements.epgCount) {
                this.elements.epgCount.textContent = '0';
            }
            return;
        }

        if (this.elements.epgEmpty) {
            this.elements.epgEmpty.classList.add('hidden');
        }

        if (this.elements.epgCount) {
            this.elements.epgCount.textContent = filteredChannels.length.toString();
        }

        // Show filtered channels
        filteredChannels.forEach(channel => {
            const channelId = channel.id?.toString() || channel.identifier || channel.name;
            if (!channelId) return;

            const card = this.createChannelCard(channel, 'epg');
            container.appendChild(card);
        });
    }

    createChannelCard(channel, type) {
        const card = document.createElement('div');
        card.className = 'channel-card';

        // Set channel ID based on type
        if (type === 'streaming') {
            card.dataset.channelId = channel.channel_id || channel.id || channel.name;
        } else {
            card.dataset.channelId = channel.id?.toString() || channel.identifier || channel.name;
        }

        card.dataset.channelType = type;

        // Check if this channel is mapped
        const channelId = card.dataset.channelId;
        const isMapped = type === 'streaming' && this.state.aliases.has(channelId);

        if (isMapped) {
            card.classList.add('mapped');
            card.classList.add('new'); // Will be removed after animation
        }

        // Create logo or fallback
        const logoUrl = channel.logo || channel.logo_url || channel.icon_url || '';
        let logoFallback = '?';

        if (type === 'streaming') {
            logoFallback = channel.name ? channel.name.charAt(0).toUpperCase() : '?';
        } else {
            // For EPG channels, use display_name or name
            const displayName = channel.display_name || channel.name || '';
            logoFallback = displayName ? displayName.charAt(0).toUpperCase() : '?';
        }

        const logoDiv = document.createElement('div');
        logoDiv.className = 'channel-logo';
        if (logoUrl) {
            logoDiv.style.backgroundImage = `url(${logoUrl})`;
            logoDiv.style.backgroundSize = 'cover';
            logoDiv.style.backgroundPosition = 'center';
        } else {
            logoDiv.classList.add('channel-logo-fallback');
            logoDiv.textContent = logoFallback;
        }

        // Create info container
        const infoDiv = document.createElement('div');
        infoDiv.className = 'channel-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'channel-name';

        // Set display name based on type
        if (type === 'streaming') {
            nameDiv.textContent = channel.name || channelId;
        } else {
            // For EPG: Use display_name as main name, show name as ID
            nameDiv.textContent = channel.display_name || channel.name || channelId;
        }

        const idDiv = document.createElement('div');
        idDiv.className = 'channel-id';

        if (type === 'streaming') {
            idDiv.textContent = channelId;
        } else {
            // For EPG: Show the technical name (like tkmde_392)
            idDiv.textContent = channel.name || channelId;
        }

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(idDiv);

        // Add mapping info for streaming channels
        if (type === 'streaming' && isMapped) {
            const aliasInfo = this.state.aliases.get(channelId);
            if (aliasInfo && aliasInfo.epgChannelId) {
                const epgChannel = this.channelLookup.epg.get(aliasInfo.epgChannelId);
                const epgDisplayName = epgChannel?.display_name || aliasInfo.epgChannelId;

                const mappingDiv = document.createElement('div');
                mappingDiv.className = 'channel-mapping';
                mappingDiv.textContent = `Linked to: ${epgDisplayName}`;
                mappingDiv.title = `EPG ID: ${aliasInfo.epgChannelId}`;
                infoDiv.appendChild(mappingDiv);
            }
        }

        // Add mapped indicator
        if (isMapped) {
            const indicator = document.createElement('div');
            indicator.className = 'mapped-indicator';
            card.appendChild(indicator);
        }

        // Add unmap button for mapped streaming channels
        if (type === 'streaming' && isMapped) {
            const unmapBtn = document.createElement('button');
            unmapBtn.className = 'unmap-btn';
            unmapBtn.innerHTML = '×';
            unmapBtn.title = 'Unmap channel';
            unmapBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showUnmapModal(channelId, channel.name);
            });
            card.appendChild(unmapBtn);
        }

        // Assemble card
        card.appendChild(logoDiv);
        card.appendChild(infoDiv);

        // Make EPG channels draggable
        if (type === 'epg') {
            card.draggable = true;
            card.title = 'Drag to map onto a streaming channel';
        } else {
            card.title = 'Drop EPG channel here to map';
        }

        // Remove animation class after animation completes
        if (card.classList.contains('new')) {
            setTimeout(() => {
                card.classList.remove('new');
            }, 2000);
        }

        return card;
    }

    async handleMapping(streamingId, streamingName) {
        if (!this.state.currentMapping || !this.state.currentMapping.epgId) {
            window.showToast('Please select an EPG channel to map', 'warning');
            return;
        }

        const epgId = this.state.currentMapping.epgId;
        const epgName = this.state.currentMapping.epgName;

        // Check if streaming channel already has an alias
        const existingAlias = this.state.aliases.get(streamingId);

        if (existingAlias) {
            // Confirm overwrite
            const confirmed = confirm(
                `Channel "${streamingName}" is already mapped to EPG: ${existingAlias.epgChannelName}\n\n` +
                `Do you want to replace it with "${epgName}"?`
            );

            if (!confirmed) return;

            // Delete existing alias first
            await this.deleteAlias(existingAlias.aliasId, streamingId);
        }

        // Create new alias
        this.state.isLoading.mapping = true;
        this.updateStatus(`Mapping ${epgName} to ${streamingName}...`);

        try {
            // Create alias in EPG backend
            const response = await fetch('/api/mapping/create-alias', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    channel_identifier: epgId,
                    alias: streamingId,
                    alias_type: 'ultimate_backend'
                })
            });

            const data = await response.json();

            if (data.success) {
                // Update local state
                const epgChannel = this.channelLookup.epg.get(epgId);
                this.state.aliases.set(streamingId, {
                    aliasId: data.alias?.id,
                    epgChannelId: epgId,
                    alias: streamingId,
                    epgChannelName: epgChannel?.display_name || epgName
                });

                // Update reverse lookup
                this.channelLookup.aliasToStreaming.set(epgId, streamingId);

                // Show success
                window.showToast(`Successfully mapped ${epgName} to ${streamingName}`, 'success');

                // Re-render affected channels
                this.renderStreamingChannels();
                this.renderEPGChannels();
                this.updateStats();

                // Clear current mapping
                this.state.currentMapping = null;
            } else {
                throw new Error(data.error || 'Failed to create alias');
            }
        } catch (error) {
            console.error('Error creating alias:', error);
            window.showToast(`Error creating mapping: ${error.message}`, 'error');
        } finally {
            this.state.isLoading.mapping = false;
            this.updateStatus('Ready');
        }
    }

    async deleteAlias(aliasId, streamingId) {
        try {
            const response = await fetch(`/api/aliases/${aliasId}`, {
                method: 'DELETE'
            });

            if (response.ok || response.status === 204) {
                // Remove from local state
                const aliasInfo = this.state.aliases.get(streamingId);
                if (aliasInfo) {
                    this.channelLookup.aliasToStreaming.delete(aliasInfo.epgChannelId);
                }
                this.state.aliases.delete(streamingId);

                return true;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error deleting alias:', error);
            throw error;
        }
    }

    showUnmapModal(streamingId, streamingName) {
        const aliasInfo = this.state.aliases.get(streamingId);
        if (!aliasInfo) return;

        // Store for confirmation
        this.state.pendingUnmap = { streamingId, aliasInfo, streamingName };

        // Show modal
        if (this.elements.unmapModal) {
            this.elements.unmapModal.classList.remove('hidden');
        }
    }

    hideUnmapModal() {
        if (this.elements.unmapModal) {
            this.elements.unmapModal.classList.add('hidden');
        }
        this.state.pendingUnmap = null;
    }

    async performUnmap() {
        if (!this.state.pendingUnmap) return;

        const { streamingId, aliasInfo, streamingName } = this.state.pendingUnmap;

        this.state.isLoading.mapping = true;
        this.updateStatus(`Unmapping ${streamingName}...`);

        try {
            await this.deleteAlias(aliasInfo.aliasId, streamingId);

            // Show success
            window.showToast(`Successfully unmapped ${streamingName}`, 'success');

            // Re-render channels
            this.renderStreamingChannels();
            this.renderEPGChannels();
            this.updateStats();

        } catch (error) {
            console.error('Error unmapping:', error);
            window.showToast(`Error unmapping: ${error.message}`, 'error');
        } finally {
            this.state.isLoading.mapping = false;
            this.updateStatus('Ready');
            this.hideUnmapModal();
        }
    }

    updateStats() {
        // Streaming channel count
        if (this.elements.streamingCount) {
            this.elements.streamingCount.textContent = this.state.streamingChannels.length.toString();
        }

        // EPG channel count
        if (this.elements.epgTotalCount) {
            this.elements.epgTotalCount.textContent = this.state.epgChannels.length.toString();
        }

        // Mapped count
        const mappedCount = this.state.aliases.size;
        if (this.elements.mappedCount) {
            this.elements.mappedCount.textContent = mappedCount.toString();
        }
    }

    updateStatus(message) {
        if (this.elements.mappingStatus) {
            this.elements.mappingStatus.textContent = message;
        }
    }

    showLoading(containerElement, loadingElement) {
        if (containerElement) {
            containerElement.style.display = 'none';
        }
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
    }

    hideLoading(containerElement, loadingElement) {
        if (containerElement) {
            containerElement.style.display = 'grid';
        }
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.epgMappingManager = new EPGMappingManager();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.epgMappingManager) {
            window.epgMappingManager.destroy();
        }
    });
});