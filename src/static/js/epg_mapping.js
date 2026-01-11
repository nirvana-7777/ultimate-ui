/**
 * EPG Mapping Manager
 * Handles drag-and-drop mapping between Ultimate Backend channels and EPG channels
 * IMPROVED VERSION: Better drag-and-drop with container-wide drop zones
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
                        const displayName = epgChannel.display_name || 'Unknown';
                        const techName = epgChannel.name || channelId;
                        this.state.currentMapping = {
                            epgId: channelId,
                            epgDisplayName: displayName,
                            epgTechName: techName,
                            epgFullName: `${displayName} (${techName})`
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

            // Remove drag-over classes from all cards
            document.querySelectorAll('.channel-card.drag-over').forEach(card => {
                card.classList.remove('drag-over');
            });

            // Remove container drag-active class
            if (this.elements.streamingContainer) {
                this.elements.streamingContainer.classList.remove('drag-active');
            }

            // Clear current mapping
            this.state.currentMapping = null;
        });

        // ============================================
        // IMPROVED DROP ZONE: Entire streaming container
        // ============================================

        const streamingContainer = this.elements.streamingContainer;
        if (!streamingContainer) return;

        // Make container accept drops
        streamingContainer.addEventListener('dragover', (e) => {
            if (this.state.currentMapping) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                // Visual feedback: highlight container
                streamingContainer.classList.add('drag-active');

                // Also highlight the closest card
                this.highlightClosestCard(e.clientX, e.clientY);
            }
        });

        streamingContainer.addEventListener('dragenter', (e) => {
            if (this.state.currentMapping) {
                e.preventDefault();
                streamingContainer.classList.add('drag-active');
            }
        });

        streamingContainer.addEventListener('dragleave', (e) => {
            // Only remove if not dragging over a child element
            if (!streamingContainer.contains(e.relatedTarget)) {
                streamingContainer.classList.remove('drag-active');
                // Remove highlight from all cards
                document.querySelectorAll('.channel-card.drag-over').forEach(card => {
                    card.classList.remove('drag-over');
                });
            }
        });

        streamingContainer.addEventListener('drop', (e) => {
            e.preventDefault();

            if (!this.state.currentMapping) return;

            // Remove visual feedback
            streamingContainer.classList.remove('drag-active');
            document.querySelectorAll('.channel-card.drag-over').forEach(card => {
                card.classList.remove('drag-over');
            });

            // Find the closest streaming channel card
            const card = this.findClosestCard(e.clientX, e.clientY);
            if (card && card.dataset.channelType === 'streaming') {
                const streamingId = card.dataset.channelId;
                const streamingChannel = this.channelLookup.streaming.get(streamingId);
                if (streamingChannel) {
                    const streamingName = streamingChannel.Name || streamingChannel.name || streamingId;
                    this.handleMapping(streamingId, streamingName);
                }
            } else {
                console.warn('No suitable streaming channel found near drop location');
            }
        });

        // Keep existing card drag-over for visual feedback (optional)
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
                    // Only remove if not entering a child element
                    if (!card.contains(e.relatedTarget)) {
                        card.classList.remove('drag-over');
                    }
                }
            }
        });
    }

    findClosestCard(x, y) {
        const cards = document.querySelectorAll('.channel-card[data-channel-type="streaming"]');
        let closestCard = null;
        let closestDistance = Infinity;

        cards.forEach(card => {
            const rect = card.getBoundingClientRect();

            // Calculate distance from drop point to card center
            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            const distance = Math.sqrt(
                Math.pow(x - cardCenterX, 2) + Math.pow(y - cardCenterY, 2)
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestCard = card;
            }
        });

        // Only accept if reasonably close (within 200px for generous drop area)
        return closestDistance < 200 ? closestCard : null;
    }

    highlightClosestCard(x, y) {
        // Remove highlight from all cards first
        document.querySelectorAll('.channel-card.drag-over').forEach(card => {
            card.classList.remove('drag-over');
        });

        // Highlight the closest card
        const closestCard = this.findClosestCard(x, y);
        if (closestCard) {
            closestCard.classList.add('drag-over');
        }
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
                // Fix: Handle nested channels structure
                const channelsData = data.channels?.channels || data.channels || [];
                this.state.streamingChannels = Array.isArray(channelsData) ? channelsData : [];

                // Update lookup
                this.channelLookup.streaming.clear();
                this.state.streamingChannels.forEach(channel => {
                    const channelId = channel.Id || channel.channel_id || channel.id || channel.name;
                    if (channelId) {
                        this.channelLookup.streaming.set(channelId, channel);
                    }
                });

                // Load aliases for these channels using new bulk endpoint
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

            // TRY NEW BULK ENDPOINT FIRST (most efficient)
            try {
                const response = await fetch('/api/aliases');
                if (response.ok) {
                    const data = await response.json();

                    if (data.aliases && Array.isArray(data.aliases)) {
                        data.aliases.forEach(alias => {
                            if (alias.alias) {
                                this.state.aliases.set(alias.alias, {
                                    aliasId: alias.id,
                                    epgChannelId: alias.channel_id,
                                    alias: alias.alias,
                                    epgChannelName: alias.channel_display_name || `Channel ${alias.channel_id}`,
                                    epgTechName: alias.channel_name || alias.channel_id.toString(),  // Store technical name
                                    aliasType: alias.alias_type,
                                    createdAt: alias.created_at
                                });

                                // Add reverse lookup for EPG channels
                                this.channelLookup.aliasToStreaming.set(alias.channel_id.toString(), alias.alias);
                            }
                        });

                        console.log(`Loaded ${data.aliases.length} aliases from bulk endpoint`);
                        return; // Success, exit early
                    }
                }
            } catch (bulkError) {
                console.warn('Bulk alias endpoint failed, falling back to individual requests...', bulkError);
            }

            // FALLBACK: Original inefficient method (for backward compatibility)
            console.warn('Using fallback alias loading method');

            for (const [streamingId, streamingChannel] of this.channelLookup.streaming) {
                try {
                    for (const [epgId, epgChannel] of this.channelLookup.epg) {
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
                                        epgChannelName: epgChannel.display_name || epgChannel.name,
                                        epgTechName: epgChannel.name || epgId
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

    findEPGChannelName(channelId) {
        // Try to find the EPG channel in our lookup
        const epgChannel = this.channelLookup.epg.get(channelId.toString());
        if (epgChannel) {
            return epgChannel.name || channelId;
        }

        // Search in the EPG channels array
        const foundChannel = this.state.epgChannels.find(
            channel => channel.id?.toString() === channelId.toString() ||
                       channel.identifier === channelId.toString()
        );

        return foundChannel?.name || channelId;
    }

    renderStreamingChannels() {
        const container = this.elements.streamingContainer;
        if (!container) return;

        container.innerHTML = '';

        if (!this.state.streamingChannels || this.state.streamingChannels.length === 0) {
            if (this.elements.streamingEmpty) {
                this.elements.streamingEmpty.classList.remove('hidden');
            }
            return;
        }

        if (this.elements.streamingEmpty) {
            this.elements.streamingEmpty.classList.add('hidden');
        }

        this.state.streamingChannels.forEach(channel => {
            const channelId = channel.Id || channel.channel_id || channel.id || channel.name;
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
            card.dataset.channelId = channel.Id || channel.channel_id || channel.id || channel.name;
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
        const logoUrl = channel.LogoUrl || channel.logo || channel.logo_url || channel.icon_url || '';
        let logoFallback = '?';

        if (type === 'streaming') {
            const channelName = channel.Name || channel.name || '';
            logoFallback = channelName ? channelName.charAt(0).toUpperCase() : '?';
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
            nameDiv.textContent = channel.Name || channel.name || channelId;
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

        // Add mapping info for streaming channels with better display text
        if (type === 'streaming' && isMapped) {
            const aliasInfo = this.state.aliases.get(channelId);
            if (aliasInfo) {
                const epgChannel = this.channelLookup.epg.get(aliasInfo.epgChannelId);

                // Build more informative display text
                let displayText = '';
                let tooltipText = '';

                if (epgChannel) {
                    // Format: "Linked to: Display Name (Technical Name)"
                    const displayName = epgChannel.display_name || 'Unknown';
                    const techName = epgChannel.name || aliasInfo.epgChannelId;
                    displayText = `Linked to: ${displayName} (${techName})`;
                    tooltipText = `EPG ID: ${aliasInfo.epgChannelId}`;
                } else if (aliasInfo.epgChannelName) {
                    // If we have the name from alias data
                    const techName = aliasInfo.epgTechName || this.findEPGChannelName(aliasInfo.epgChannelId);
                    displayText = `Linked to: ${aliasInfo.epgChannelName} (${techName})`;
                    tooltipText = `EPG ID: ${aliasInfo.epgChannelId}`;
                } else {
                    // Fallback
                    displayText = `Linked to: Channel ${aliasInfo.epgChannelId}`;
                    tooltipText = `EPG ID: ${aliasInfo.epgChannelId}`;
                }

                const mappingDiv = document.createElement('div');
                mappingDiv.className = 'channel-mapping';
                mappingDiv.textContent = displayText;
                mappingDiv.title = tooltipText;
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
                const channelName = channel.Name || channel.name || channelId;
                this.showUnmapModal(channelId, channelName);
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
        const epgDisplayName = this.state.currentMapping.epgDisplayName || 'Unknown';
        const epgTechName = this.state.currentMapping.epgTechName || epgId;
        const epgFullName = this.state.currentMapping.epgFullName || `${epgDisplayName} (${epgTechName})`;

        // Check if streaming channel already has an alias
        const existingAlias = this.state.aliases.get(streamingId);

        if (existingAlias) {
            // Get details of existing mapping for better confirmation message
            const existingEPG = this.channelLookup.epg.get(existingAlias.epgChannelId);
            const existingDisplayName = existingEPG?.display_name || existingAlias.epgChannelName || 'Unknown';
            const existingTechName = existingEPG?.name || existingAlias.epgChannelId;
            const existingFullName = `${existingDisplayName} (${existingTechName})`;

            // Confirm overwrite with better display
            const confirmed = confirm(
                `Channel "${streamingName}" is already mapped to:\n${existingFullName}\n\n` +
                `Do you want to replace it with:\n${epgFullName}?`
            );

            if (!confirmed) return;

            // Delete existing alias first
            await this.deleteAlias(existingAlias.aliasId, streamingId);
        }

        // Create new alias
        this.state.isLoading.mapping = true;
        this.updateStatus(`Mapping ${epgFullName} to ${streamingName}...`);

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
                // Get the EPG channel for full details
                const epgChannel = this.channelLookup.epg.get(epgId);

                // Update local state with full details
                this.state.aliases.set(streamingId, {
                    aliasId: data.alias?.id,
                    epgChannelId: epgId,
                    alias: streamingId,
                    epgChannelName: epgChannel?.display_name || epgDisplayName,
                    epgTechName: epgChannel?.name || epgTechName,
                    aliasType: 'ultimate_backend'
                });

                // Update reverse lookup
                this.channelLookup.aliasToStreaming.set(epgId, streamingId);

                // Show success with better display
                window.showToast(`Successfully mapped ${streamingName} to ${epgFullName}`, 'success');

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

        // Get EPG channel details for better display
        const epgChannel = this.channelLookup.epg.get(aliasInfo.epgChannelId);
        const epgDisplayName = epgChannel?.display_name || aliasInfo.epgChannelName || 'Unknown';
        const epgTechName = epgChannel?.name || aliasInfo.epgTechName || aliasInfo.epgChannelId;
        const epgFullName = `${epgDisplayName} (${epgTechName})`;

        // Update modal text with better display
        const modalText = document.querySelector('#unmap-modal .modal-content p');
        if (modalText) {
            modalText.textContent = `Are you sure you want to unmap "${streamingName}" from "${epgFullName}"?`;
        }

        // Store for confirmation
        this.state.pendingUnmap = {
            streamingId,
            aliasInfo,
            streamingName,
            epgFullName
        };

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

        const { streamingId, aliasInfo, streamingName, epgFullName } = this.state.pendingUnmap;

        this.state.isLoading.mapping = true;
        this.updateStatus(`Unmapping ${streamingName} from ${epgFullName}...`);

        try {
            await this.deleteAlias(aliasInfo.aliasId, streamingId);

            // Show success with better info
            window.showToast(`Successfully unmapped ${streamingName} from ${epgFullName}`, 'success');

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
            const streamingCount = this.state.streamingChannels?.length || 0;
            this.elements.streamingCount.textContent = streamingCount.toString();
        }

        // EPG channel count
        if (this.elements.epgTotalCount) {
            const epgCount = this.state.epgChannels?.length || 0;
            this.elements.epgTotalCount.textContent = epgCount.toString();
        }

        // Mapped count
        const mappedCount = this.state.aliases?.size || 0;
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
            // Cleanup if needed
        }
    });
});