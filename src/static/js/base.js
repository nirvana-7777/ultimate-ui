/**
 * Ultimate UI - Base Template JavaScript
 * Handles common functionality for all pages
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

        // Safely parse JSON config
        const configStr = dataElement.getAttribute('data-config');
        try {
            // Handle escaped JSON
            const decoded = configStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            data.config = JSON.parse(decoded);
        } catch (e) {
            console.error('Failed to parse config JSON:', e, 'Raw:', configStr);
            data.config = {};
        }

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
        } catch (error) {
            const statusDot = document.getElementById('webepg-status');
            if (statusDot) {
                statusDot.className = 'status-dot offline';
                statusDot.title = 'Verbindungsfehler';
            }
        }
    }

    refreshCurrentTab() {
        if (window.showLoading) window.showLoading();

        const currentTab = this.data.activeTab || 'epg';

        switch(currentTab) {
            case 'epg':
                window.location.reload();
                break;
            case 'config':
                // Config doesn't need refresh
                if (window.hideLoading) window.hideLoading();
                break;
            case 'mapping':
                fetch('/api/mapping/providers')
                    .then(response => response.json())
                    .then(data => {
                        if (data.success && window.showToast) {
                            window.showToast('Mapping-Daten aktualisiert');
                        }
                        if (window.hideLoading) window.hideLoading();
                    })
                    .catch(() => {
                        if (window.hideLoading) window.hideLoading();
                    });
                break;
            case 'monitoring':
                fetch('/api/monitoring/status')
                    .then(response => response.json())
                    .then(data => {
                        if (data.success && window.showToast) {
                            window.showToast('Monitoring-Daten aktualisiert');
                        }
                        if (window.hideLoading) window.hideLoading();
                    })
                    .catch(() => {
                        if (window.hideLoading) window.hideLoading();
                    });
                break;
            default:
                if (window.hideLoading) window.hideLoading();
        }
    }

    setupAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        const currentTab = this.data.activeTab || 'epg';
        const refreshInterval = this.data.refreshInterval || 300;

        // Only auto-refresh EPG and Monitoring tabs
        if ((currentTab === 'epg' || currentTab === 'monitoring') && refreshInterval > 0) {
            this.refreshTimer = setInterval(() => this.refreshCurrentTab(), refreshInterval * 1000);
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
        // Ctrl+R or F5: Refresh
        if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
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

        // Number keys 1-4: Switch tabs
        if (e.key >= '1' && e.key <= '4') {
            const tabIndex = parseInt(e.key, 10) - 1;
            const navItems = document.querySelectorAll('.nav-item');
            if (navItems[tabIndex]) {
                navItems[tabIndex].click();
            }
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const baseTemplate = new BaseTemplate();
    baseTemplate.init();

    // Make available globally if needed
    window.baseTemplate = baseTemplate;
});