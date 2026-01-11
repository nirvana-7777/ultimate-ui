/**
 * EPG Mapping Drag & Drop Manager
 * Handles all drag-and-drop interactions
 */

class EPGMappingDragDrop {
    constructor(stateManager, uiManager, mappingHandler) {
        this.state = stateManager;
        this.ui = uiManager;
        this.handler = mappingHandler;
        this.isDragging = false;
    }

    setup(streamingContainer) {
        this.setupGlobalListeners();
        this.setupContainerDropZone(streamingContainer);
    }

    setupGlobalListeners() {
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('dragenter', this.handleDragEnter.bind(this));
        document.addEventListener('dragleave', this.handleDragLeave.bind(this));
    }

    setupContainerDropZone(container) {
        if (!container) return;

        container.addEventListener('dragover', this.handleContainerDragOver.bind(this));
        container.addEventListener('dragenter', this.handleContainerDragEnter.bind(this));
        container.addEventListener('dragleave', this.handleContainerDragLeave.bind(this));
        container.addEventListener('drop', this.handleContainerDrop.bind(this));
    }

    // Event handlers
    handleDragStart(e) {
        if (!e.target.classList.contains('channel-card')) return;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');

        const card = e.target;
        card.classList.add('dragging');
        this.isDragging = true;

        const channelId = card.dataset.channelId;
        const channelType = card.dataset.channelType;

        if (channelType === 'epg') {
            this.setCurrentEPGMapping(channelId);
        }
    }

    handleDragEnd(e) {
        this.cleanupDragState();
        this.isDragging = false;
    }

    handleDragOver(e) {
        if (!this.state.currentMapping) return;

        if (e.target.classList.contains('channel-card')) {
            const card = e.target.closest('.channel-card');
            if (card && card.dataset.channelType === 'streaming') {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        }
    }

    handleDragEnter(e) {
        if (this.state.currentMapping && e.target.classList.contains('channel-card')) {
            const card = e.target.closest('.channel-card');
            if (card && card.dataset.channelType === 'streaming') {
                card.classList.add('drag-over');
            }
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains('channel-card')) {
            const card = e.target.closest('.channel-card');
            if (card && card.classList.contains('drag-over')) {
                if (!card.contains(e.relatedTarget)) {
                    card.classList.remove('drag-over');
                }
            }
        }
    }

    // Container-specific handlers
    handleContainerDragOver(e) {
        if (this.state.currentMapping) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (e.currentTarget) {
                e.currentTarget.classList.add('drag-active');
                this.highlightClosestCard(e.clientX, e.clientY);
            }
        }
    }

    handleContainerDragEnter(e) {
        if (this.state.currentMapping && e.currentTarget) {
            e.preventDefault();
            e.currentTarget.classList.add('drag-active');
        }
    }

    handleContainerDragLeave(e) {
        if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('drag-active');
            this.clearAllCardHighlights();
        }
    }

    async handleContainerDrop(e) {
        e.preventDefault();

        if (!this.state.currentMapping) return;

        // Clean up visual feedback
        if (e.currentTarget) {
            e.currentTarget.classList.remove('drag-active');
        }
        this.clearAllCardHighlights();

        // Find and handle the drop
        const card = this.findClosestCard(e.clientX, e.clientY);
        if (card && card.dataset.channelType === 'streaming') {
            await this.handler.handleMapping(card.dataset.channelId);
        } else {
            console.warn('No suitable streaming channel found near drop location');
        }
    }

    // Helper methods
    setCurrentEPGMapping(epgId) {
        const epgChannel = this.state.channelLookup.epg.get(epgId);
        if (epgChannel) {
            const displayName = epgChannel.display_name || 'Unknown';
            const techName = epgChannel.name || epgId;
            this.state.currentMapping = {
                epgId: epgId,
                epgDisplayName: displayName,
                epgTechName: techName,
                epgFullName: `${displayName} (${techName})`
            };
        }
    }

    findClosestCard(x, y) {
        const cards = document.querySelectorAll('.channel-card[data-channel-type="streaming"]');
        let closestCard = null;
        let closestDistance = Infinity;

        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
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

        return closestDistance < 200 ? closestCard : null;
    }

    highlightClosestCard(x, y) {
        this.clearAllCardHighlights();
        const closestCard = this.findClosestCard(x, y);
        if (closestCard) {
            closestCard.classList.add('drag-over');
        }
    }

    clearAllCardHighlights() {
        document.querySelectorAll('.channel-card.drag-over').forEach(card => {
            card.classList.remove('drag-over');
        });
    }

    cleanupDragState() {
        document.querySelectorAll('.channel-card.dragging').forEach(card => {
            card.classList.remove('dragging');
        });

        document.querySelectorAll('.channel-card.drag-over').forEach(card => {
            card.classList.remove('drag-over');
        });

        document.querySelectorAll('.drag-active').forEach(el => {
            el.classList.remove('drag-active');
        });

        this.state.currentMapping = null;
    }
}

export default EPGMappingDragDrop;