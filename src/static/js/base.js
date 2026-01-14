/**
 * Ultimate UI - Base Template JavaScript
 * Handles common functionality for all pages - FIXED AUTO-REFRESH
 */

class BaseTemplate {
    constructor() {
        this.data = this.loadTemplateData();
        this.refreshTimer = null;
        this.initialized = false;
    }

    loadTemplateData() {
        const dataElement = document.getElementById('template-data');
        if (!dataElement) return {};

        const data = {};

        // Get string values
        data.activeTab = dataElement.getAttribute('data-active-tab') || 'epg';
        data.refreshInterval = parseInt(dataElement.getAttribute('data-refresh-interval') || '300', 10);
        data.currentTime = dataElement.getAttribute('data-current-time') || '';
        data.theme = dataElement.getAttribute('data-theme') || 'dark';

        data.config = {};

        return data;
    }

    init() {
        if (this.initialized) return;

        this.setupEventListeners();
        this.startBackgroundTasks();

        this.initialized = true;
    }

    setupEventListeners() {
        // Mobile menu toggle
        const mobileToggle = document.getElementById('mobile-menu-toggle');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const sidebar = document.getElementById('sidebar');

        if (mobileToggle && sidebar && mobileOverlay) {
            mobileToggle.addEventListener('click', () => this.toggleMobileMenu());
            mobileOverlay.addEventListener('click', () => this.toggleMobileMenu());
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshCurrentTab());
        }

        // Logo click to go home
        const logo = document.getElementById('logo');
        if (logo) {
            logo.addEventListener('click', () => {
                window.location.href = '/';
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    startBackgroundTasks() {
        // Update current time every minute
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);

        // Check backend status periodically
        this.checkBackendStatus();
        setInterval(() => this.checkBackendStatus(), 60000);

        // Set up auto-refresh
        this.setupAutoRefresh();

        // Apply theme
        this.applyTheme();
    }

    updateCurrentTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const dateStr = now.toLocaleDateString('de-DE', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
        });

        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = `${dateStr} ${timeStr}`;
        }
    }

    async checkBackendStatus() {
        try {
            const response = await fetch('/api/monitoring/status');
            const data = await response.json();

            const statusDot = document.getElementById('webepg-status');
            const indicator = document.getElementById('status-indicator');

            if (!statusDot || !indicator) return;

            if (data.webepg_health) {
                statusDot.className = 'status-dot online';
                statusDot.title = 'WebEPG ist online';
                indicator.className = 'status-indicator online';
            } else {
                statusDot.className = 'status-dot offline';
                statusDot.title = 'WebEPG ist offline';
                indicator.className = 'status-indicator offline';
            }
        } catch (_error) {
            const statusDot = document.getElementById('webepg-status');
            if (statusDot) {
                statusDot.className = 'status-dot offline';
                statusDot.title = 'Verbindungsfehler';
            }
        }
    }

    refreshCurrentTab() {
        const currentTab = this.data.activeTab || 'epg';

        switch(currentTab) {
            case 'epg':
                // For EPG tab, use JavaScript refresh instead of page reload
                if (window.epgDisplayManager && typeof window.epgDisplayManager.refreshData === 'function') {
                    console.log('Refreshing EPG data via JavaScript...');
                    window.epgDisplayManager.refreshData();
                } else {
                    // Fallback to page reload if manager not available
                    console.log('EPG manager not available, reloading page...');
                    window.location.reload();
                }
                break;

            case 'config':
                // Config doesn't need refresh
                if (window.showToast) {
                    window.showToast('Konfiguration ist bereits aktuell', 'info');
                }
                break;

            case 'mapping':
                this.refreshMappingTab();
                break;

            case 'monitoring':
                this.refreshMonitoringTab();
                break;

            default:
                console.log('Unknown tab:', currentTab);
        }
    }

    async refreshMappingTab() {
        if (window.showLoading) window.showLoading();

        try {
            const response = await fetch('/api/mapping/providers');
            const data = await response.json();

            if (data.success && window.showToast) {
                window.showToast('Mapping-Daten aktualisiert', 'success');
            }
        } catch (error) {
            console.error('Error refreshing mapping:', error);
            if (window.showToast) {
                window.showToast('Fehler beim Aktualisieren', 'error');
            }
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async refreshMonitoringTab() {
        if (window.showLoading) window.showLoading();

        try {
            const response = await fetch('/api/monitoring/status');
            const data = await response.json();

            if (data.success && window.showToast) {
                window.showToast('Monitoring-Daten aktualisiert', 'success');
            }

            // If there's a monitoring manager, call its refresh method
            if (window.monitoringManager && typeof window.monitoringManager.refresh === 'function') {
                window.monitoringManager.refresh(data);
            }
        } catch (error) {
            console.error('Error refreshing monitoring:', error);
            if (window.showToast) {
                window.showToast('Fehler beim Aktualisieren', 'error');
            }
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    setupAutoRefresh() {
        // Clear any existing timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        const currentTab = this.data.activeTab || 'epg';
        const refreshInterval = this.data.refreshInterval || 300;

        // Only auto-refresh EPG and Monitoring tabs
        if ((currentTab === 'epg' || currentTab === 'monitoring') && refreshInterval > 0) {
            console.log(`Setting up auto-refresh for ${currentTab} every ${refreshInterval} seconds`);

            this.refreshTimer = setInterval(() => {
                console.log(`Auto-refreshing ${currentTab}...`);
                this.refreshCurrentTab();
            }, refreshInterval * 1000);
        } else {
            console.log('Auto-refresh disabled for current tab:', currentTab);
        }
    }

    toggleMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');

        if (sidebar && overlay) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        }
    }

    applyTheme() {
        const theme = this.data.theme || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
    }

    handleKeyboardShortcuts(e) {
        // Ctrl+R or F5: Refresh (only if not in input field)
        if (((e.ctrlKey && e.key === 'r') || e.key === 'F5') &&
            !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            this.refreshCurrentTab();
        }

        // Escape: Close mobile menu
        if (e.key === 'Escape') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('active')) {
                this.toggleMobileMenu();
            }
        }

        // Number keys 1-4: Switch tabs (only if not in input field)
        if (e.key >= '1' && e.key <= '4' &&
            !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            const tabIndex = parseInt(e.key, 10) - 1;
            const navItems = document.querySelectorAll('.nav-item');
            if (navItems[tabIndex]) {
                navItems[tabIndex].click();
            }
        }
    }

    cleanup() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const baseTemplate = new BaseTemplate();
    baseTemplate.init();

    // Make available globally
    window.baseTemplate = baseTemplate;

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        baseTemplate.cleanup();
    });
});