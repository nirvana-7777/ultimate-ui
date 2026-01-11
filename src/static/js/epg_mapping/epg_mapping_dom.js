/**
 * EPG Mapping DOM Manager
 * Handles DOM element references and event listener setup
 */

class EPGMappingDOM {
    constructor() {
        this.elements = {};
    }

    initializeElements() {
        this.elements = {
            // Main containers
            providerSelect: document.getElementById('provider-select'),
            refreshProviders: document.getElementById('refresh-providers'),
            streamingContainer: document.getElementById('streaming-channels-container'),
            epgContainer: document.getElementById('epg-channels-container'),

            // Loading states
            streamingLoading: document.getElementById('streaming-loading'),
            epgLoading: document.getElementById('epg-loading'),

            // Empty states
            streamingEmpty: document.getElementById('streaming-empty'),
            epgEmpty: document.getElementById('epg-empty'),

            // Search and filters
            epgSearch: document.getElementById('epg-search'),

            // Stats elements
            epgCount: document.getElementById('epg-count'),
            epgTotalCount: document.getElementById('epg-total-count'),
            streamingCount: document.getElementById('streaming-count'),
            mappedCount: document.getElementById('mapped-count'),
            mappingStatus: document.getElementById('mapping-status'),

            // Modal elements
            unmapModal: document.getElementById('unmap-modal'),
            cancelUnmap: document.getElementById('cancel-unmap'),
            confirmUnmap: document.getElementById('confirm-unmap'),
            mappingTooltip: document.getElementById('mapping-tooltip')
        };

        return this.elements;
    }

    // Utility methods for DOM manipulation
    showLoading(containerElement, loadingElement) {
        if (containerElement) containerElement.style.display = 'none';
        if (loadingElement) loadingElement.style.display = 'flex';
    }

    hideLoading(containerElement, loadingElement) {
        if (containerElement) containerElement.style.display = 'grid';
        if (loadingElement) loadingElement.style.display = 'none';
    }

    toggleEmptyState(emptyElement, isEmpty) {
        if (!emptyElement) return;
        isEmpty ? emptyElement.classList.remove('hidden') : emptyElement.classList.add('hidden');
    }

    updateText(element, text) {
        if (element) element.textContent = text;
    }

    setElementValue(element, value) {
        if (element) element.value = value;
    }

    toggleElementVisibility(element, isVisible) {
        if (!element) return;
        isVisible ? element.classList.remove('hidden') : element.classList.add('hidden');
    }

    // Helper to safely update innerHTML
    updateInnerHTML(element, html) {
        if (element) element.innerHTML = html;
    }

    // Helper to safely set disabled state
    setDisabled(element, disabled) {
        if (element) element.disabled = disabled;
    }
}

export default EPGMappingDOM;