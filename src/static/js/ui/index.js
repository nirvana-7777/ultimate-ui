// ui/index.js - Main entry point for EPG UI components
// This file loads all UI components and exports the main EPGUI class

// Load all component classes
import './EPGUIMain.js';
import './EPGRenderer.js';
import './EPGModalManager.js';
import './EPGInfiniteScroll.js';
import './EPGDateManager.js';
import './EPGUtilities.js';
import './EPGEventHandler.js';

// Create a facade class that maintains backward compatibility
class EPGUI {
    constructor(core) {
        // Use the new EPGUIMain as the implementation
        this._impl = new EPGUIMain(core);

        // Proxy all method calls to the implementation
        const handler = {
            get: (target, prop) => {
                if (prop in target._impl) {
                    return typeof target._impl[prop] === 'function'
                        ? target._impl[prop].bind(target._impl)
                        : target._impl[prop];
                }
                return target[prop];
            }
        };

        return new Proxy(this, handler);
    }
}

// Export for global use
window.EPGUI = EPGUI;