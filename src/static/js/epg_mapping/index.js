/**
 * EPG Mapping Entry Point
 * Initializes the application
 */

import EPGMappingManager from './epg_mapping.js';

document.addEventListener('DOMContentLoaded', () => {
    window.epgMappingManager = new EPGMappingManager();

    window.addEventListener('beforeunload', () => {
        if (window.epgMappingManager) {
            // Cleanup if needed
        }
    });
});