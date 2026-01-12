/**
 * EPG Mapping Entry Point
 * Initializes the application
 */

import EPGMappingManager from './epg_mapping.js';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on the mapping page
    const isMappingPage = document.getElementById('provider-select') !== null;

    if (isMappingPage) {
        // Optional: Check if FuzzySet is loaded (local version)
        if (typeof FuzzySet === 'undefined') {
            console.warn('FuzzySet not found. Check if /static/lib/fuzzyset.js is accessible.');
            // You can still continue - fuzzy matching just won't work
        }

        window.epgMappingManager = new EPGMappingManager();
        window.epgMappingManager.init().catch(error => {
            console.error('Failed to initialize EPG Mapping Manager:', error);
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (window.epgMappingManager) {
                // Cleanup if needed
            }
        });
    } else {
        console.log('Not on EPG mapping page, skipping EPG mapping initialization');
    }
});