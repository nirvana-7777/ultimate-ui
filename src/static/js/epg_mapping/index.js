/**
 * EPG Mapping Entry Point
 * Initializes the application
 */

// Import the FuzzySet library (you'll need to include it in your HTML)
// Add this to your base.html:
// <script src="https://cdn.jsdelivr.net/npm/fuzzyset.js@1.0.6/lib/fuzzyset.min.js"></script>

import EPGMappingManager from './epg_mapping.js';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on the mapping page
    const isMappingPage = document.getElementById('provider-select') !== null;

    if (isMappingPage) {
        // Check if FuzzySet is available
        if (typeof FuzzySet === 'undefined') {
            console.error('FuzzySet library is not loaded. Please include fuzzyset.js');
            alert('Fuzzy matching requires FuzzySet library. Please check console for details.');
            return;
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