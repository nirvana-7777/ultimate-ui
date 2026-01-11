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