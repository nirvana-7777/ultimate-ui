/**
 * Ultimate UI - Monitoring Page JavaScript
 * Handles monitoring functionality, charts, and system info
 */

class MonitoringManager {
    constructor() {
        this.uiStartTime = new Date();
        this.importCountdownInterval = null;
        this.charts = {};
        this.initialized = false;
        this.monitoringData = window.MONITORING_DATA || {};
    }

    init() {
        if (this.initialized) return;

        this.setupEventListeners();
        this.initializeComponents();
        this.startBackgroundUpdates();

        this.initialized = true;
    }

    setupEventListeners() {
        // Health check buttons
        const webepgCheckBtn = document.getElementById('test-webepg-btn');
        const ultimateCheckBtn = document.getElementById('test-ultimate-btn');
        const triggerImportBtn = document.getElementById('trigger-import-btn');

        if (webepgCheckBtn) {
            webepgCheckBtn.addEventListener('click', () => this.checkWebEPGHealth());
        }

        if (ultimateCheckBtn) {
            ultimateCheckBtn.addEventListener('click', () => this.checkUltimateBackendHealth());
        }

        if (triggerImportBtn) {
            triggerImportBtn.addEventListener('click', () => this.triggerImportJob());
        }

        // Refresh statistics button
        const refreshStatsBtn = document.getElementById('refresh-stats-btn');
        if (refreshStatsBtn) {
            refreshStatsBtn.addEventListener('click', () => this.refreshStatistics());
        }

        // View all imports button
        const viewAllImportsBtn = document.getElementById('view-all-imports-btn');
        if (viewAllImportsBtn) {
            viewAllImportsBtn.addEventListener('click', () => this.viewAllImports());
        }

        // Chart period selector
        const chartPeriodSelect = document.getElementById('chart-period');
        if (chartPeriodSelect) {
            chartPeriodSelect.addEventListener('change', () => this.updateCharts());
        }

        // Import details buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-view-details')) {
                const importId = e.target.getAttribute('data-import-id');
                if (importId) {
                    this.viewImportDetails(importId);
                }
            }
        });

        // Modal close button
        const modalCloseBtn = document.querySelector('.modal-close');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', () => this.closeModal());
        }
    }

    initializeComponents() {
        this.updateUptime();
        this.updateSystemInfo();
        this.updateImportCountdown();

        // Auto-run health checks after a short delay
        setTimeout(() => {
            this.checkWebEPGHealth();
            this.checkUltimateBackendHealth();
        }, 1000);

        // Initialize charts
        this.initializeCharts();
    }

    startBackgroundUpdates() {
        // Update uptime every second
        setInterval(() => this.updateUptime(), 1000);

        // Auto-refresh statistics every 5 minutes
        setInterval(() => this.refreshStatistics(), 5 * 60 * 1000);
    }

    // Formatting utilities
    formatDateTime(value) {
        if (!value || value === '-') return '-';
        try {
            const date = new Date(value);
            return date.toLocaleString('de-DE', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return value;
        }
    }

    formatTimeDiff(start, end) {
        if (!start || !end) return '-';
        try {
            const startDate = new Date(start);
            const endDate = new Date(end);
            const diffMs = endDate - startDate;

            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

            if (hours > 0) {
                return `${hours}h ${minutes}m ${seconds}s`;
            } else if (minutes > 0) {
                return `${minutes}m ${seconds}s`;
            } else {
                return `${seconds}s`;
            }
        } catch (e) {
            return '-';
        }
    }

    // Health checks
    async checkWebEPGHealth() {
        const statusElement = document.getElementById('webepg-health-status');
        const responseTimeElement = document.getElementById('webepg-response-time');

        if (!statusElement || !responseTimeElement) return;

        statusElement.textContent = 'Prüfe...';
        statusElement.className = 'health-status';

        const startTime = Date.now();

        try {
            const response = await fetch('/api/monitoring/status');
            const responseTime = Date.now() - startTime;
            responseTimeElement.textContent = `${responseTime}ms`;

            if (response.ok) {
                const data = await response.json();
                if (data.webepg_health) {
                    statusElement.textContent = 'Online';
                    statusElement.className = 'health-status online';
                    window.showToast?.('WebEPG ist online', 'success');
                } else {
                    statusElement.textContent = 'Offline';
                    statusElement.className = 'health-status offline';
                    window.showToast?.('WebEPG ist offline', 'error');
                }
            } else {
                statusElement.textContent = 'Offline';
                statusElement.className = 'health-status offline';
                window.showToast?.(`WebEPG ist offline: ${response.status}`, 'error');
            }
        } catch (error) {
            const responseTime = Date.now() - startTime;
            responseTimeElement.textContent = `${responseTime}ms (Fehler)`;
            statusElement.textContent = 'Offline';
            statusElement.className = 'health-status offline';
            window.showToast?.(`WebEPG ist offline: ${error.message}`, 'error');
        }
    }

    async checkUltimateBackendHealth() {
        const statusElement = document.getElementById('ultimate-backend-health-status');
        const responseTimeElement = document.getElementById('ultimate-backend-response-time');

        if (!statusElement || !responseTimeElement) return;

        statusElement.textContent = 'Prüfe...';
        statusElement.className = 'health-status';

        const backendUrl = this.monitoringData.config?.ultimate_backend?.url || '';
        const startTime = Date.now();

        try {
            const response = await fetch(`${backendUrl}/api/providers`);
            const responseTime = Date.now() - startTime;
            responseTimeElement.textContent = `${responseTime}ms`;

            if (response.ok) {
                statusElement.textContent = 'Online';
                statusElement.className = 'health-status online';
                window.showToast?.('Ultimate Backend ist online', 'success');
            } else {
                statusElement.textContent = `Offline (${response.status})`;
                statusElement.className = 'health-status offline';
                window.showToast?.(`Ultimate Backend ist offline: ${response.status}`, 'error');
            }
        } catch (error) {
            const responseTime = Date.now() - startTime;
            responseTimeElement.textContent = `${responseTime}ms (Fehler)`;
            statusElement.textContent = 'Offline';
            statusElement.className = 'health-status offline';
            window.showToast?.(`Ultimate Backend ist offline: ${error.message}`, 'error');
        }
    }

    // Import functionality
    async triggerImportJob() {
        if (!confirm('Import-Job manuell starten?')) {
            return;
        }

        if (window.showLoading) window.showLoading();

        try {
            const response = await fetch('/api/import/trigger', {
                method: 'POST'
            });

            const data = await response.json();

            if (window.hideLoading) window.hideLoading();

            if (data.error) {
                window.showToast?.(`Import-Fehler: ${data.error}`, 'error');
            } else {
                window.showToast?.('Import-Job gestartet', 'success');

                if (data.next_scheduled_import) {
                    const nextImportEl = document.getElementById('next-import');
                    if (nextImportEl) {
                        nextImportEl.textContent = this.formatDateTime(data.next_scheduled_import);
                    }
                    this.updateImportCountdown();
                }

                setTimeout(() => this.refreshImportList(), 5000);
            }
        } catch (error) {
            if (window.hideLoading) window.hideLoading();
            window.showToast?.(`Import-Fehler: ${error.message}`, 'error');
        }
    }

    async refreshStatistics() {
        if (window.showLoading) window.showLoading();

        try {
            const response = await fetch('/api/monitoring/status');
            const data = await response.json();

            if (window.hideLoading) window.hideLoading();

            if (data.success) {
                this.updateStatistics(data);
                window.showToast?.('Statistiken aktualisiert', 'success');
            }
        } catch (error) {
            if (window.hideLoading) window.hideLoading();
            window.showToast?.(`Fehler: ${error.message}`, 'error');
        }
    }

    updateStatistics(data) {
        // Update database statistics
        if (data.statistics) {
            const stats = data.statistics;
            const updates = [
                ['total-channels', stats.total_channels || '0'],
                ['total-programs', stats.total_programs || '0'],
                ['total-providers', stats.total_providers || '0'],
                ['total-aliases', stats.total_aliases || '0'],
                ['earliest-program', this.formatDateTime(stats.earliest_program)],
                ['latest-program', this.formatDateTime(stats.latest_program)],
                ['days-covered', stats.days_covered || '0']
            ];

            updates.forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
        }

        // Update import statistics
        if (data.import_status) {
            this.updateImportStatistics(data.import_status);
        }
    }

    updateImportStatistics(importStatus) {
        const recentImports = importStatus.recent_imports || [];
        const totalEl = document.getElementById('total-imports');
        const successEl = document.getElementById('successful-imports');
        const failedEl = document.getElementById('failed-imports');
        const lastEl = document.getElementById('last-import-time');
        const nextEl = document.getElementById('next-import');

        if (totalEl) totalEl.textContent = recentImports.length;

        const successful = recentImports.filter(i => i.status === 'success').length;
        const failed = recentImports.filter(i => i.status === 'failed').length;

        if (successEl) successEl.textContent = successful;
        if (failedEl) failedEl.textContent = failed;

        if (recentImports.length > 0 && lastEl) {
            lastEl.textContent = this.formatDateTime(recentImports[0].completed_at);
        }

        if (importStatus.next_scheduled_import && nextEl) {
            nextEl.textContent = this.formatDateTime(importStatus.next_scheduled_import);
            this.updateImportCountdown();
        }

        // Update imports table
        this.updateImportTable(recentImports);
    }

    updateImportTable(imports) {
        const tbody = document.getElementById('imports-table-body');
        if (!tbody) return;

        if (imports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-imports">Keine Importe gefunden</td></tr>';
            return;
        }

        tbody.innerHTML = imports.map(imp => `
            <tr class="import-row status-${imp.status}">
                <td><span class="import-time">${this.formatDateTime(imp.started_at)}</span></td>
                <td><span class="import-provider">Provider #${imp.provider_id}</span></td>
                <td><span class="status-badge status-${imp.status}">${imp.status.toUpperCase()}</span></td>
                <td><span class="import-count">${imp.programs_imported || '0'}</span></td>
                <td><span class="import-skipped">${imp.programs_skipped || '0'}</span></td>
                <td><span class="import-duration">${this.formatTimeDiff(imp.started_at, imp.completed_at)}</span></td>
                <td><button class="btn-view-details" data-import-id="${imp.id}">Details</button></td>
            </tr>
        `).join('');
    }

    async refreshImportList() {
        try {
            const response = await fetch('/api/monitoring/status');
            const data = await response.json();

            if (data.success && data.import_status) {
                this.updateImportTable(data.import_status.recent_imports || []);
            }
        } catch (error) {
            console.error('Error refreshing import list:', error);
        }
    }

    updateImportCountdown() {
        if (this.importCountdownInterval) {
            clearInterval(this.importCountdownInterval);
        }

        const nextImportElement = document.getElementById('next-import');
        const countdownElement = document.getElementById('import-countdown');

        if (!nextImportElement || !countdownElement) return;

        const countdownValue = countdownElement.querySelector('.countdown-value');
        if (!countdownValue) return;

        const nextImportText = nextImportElement.textContent;
        if (!nextImportText || nextImportText === '-') {
            countdownValue.textContent = '-';
            return;
        }

        try {
            const nextImportDate = new Date(nextImportText);

            const updateCountdown = () => {
                const now = new Date();
                const diffMs = nextImportDate - now;

                if (diffMs <= 0) {
                    countdownValue.textContent = 'Jetzt';
                    return;
                }

                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

                countdownValue.textContent =
                    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            };

            updateCountdown();
            this.importCountdownInterval = setInterval(updateCountdown, 1000);

        } catch (e) {
            countdownValue.textContent = '-';
        }
    }

    // Charts functionality
    initializeCharts() {
        // This is a placeholder for chart initialization
        // In a real implementation, you would use Chart.js or similar
        this.renderPlaceholderCharts();
    }

    updateCharts() {
        const periodSelect = document.getElementById('chart-period');
        if (!periodSelect) return;

        const period = periodSelect.value;
        window.showToast?.(`Diagrammperiode geändert auf: ${period}`, 'info');

        // In a real implementation, you would fetch new chart data
        this.renderPlaceholderCharts();
    }

    renderPlaceholderCharts() {
        const chartContainers = document.querySelectorAll('.chart-container canvas');

        chartContainers.forEach((canvas) => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted');
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Diagramm wird geladen...', canvas.width / 2, canvas.height / 2);
        });
    }

    // System info
    updateUptime() {
        const now = new Date();
        const uptimeMs = now - this.uiStartTime;

        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);

        const uptimeEl = document.getElementById('ui-uptime');
        if (uptimeEl) {
            uptimeEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
        }

        // Update last refresh time
        const lastRefreshEl = document.getElementById('last-refresh');
        if (lastRefreshEl) {
            lastRefreshEl.textContent = now.toLocaleTimeString('de-DE');
        }
    }

    updateSystemInfo() {
        // UI info
        const uiStartTimeEl = document.getElementById('ui-start-time');
        if (uiStartTimeEl) {
            uiStartTimeEl.textContent = this.uiStartTime.toLocaleString('de-DE');
        }

        // Browser info
        const updates = [
            ['user-agent', navigator.userAgent.substring(0, 50) + '...'],
            ['platform', navigator.platform],
            ['screen-resolution', `${window.screen.width} × ${window.screen.height}`],
            ['online-status', navigator.onLine ? 'Online' : 'Offline']
        ];

        updates.forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });

        // Storage usage
        this.updateStorageInfo();
    }

    updateStorageInfo() {
        // Local Storage
        try {
            let localStorageSize = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                localStorageSize += key.length + (value ? value.length : 0);
            }

            const localStorageEl = document.getElementById('local-storage-usage');
            if (localStorageEl) {
                localStorageEl.textContent = `${Math.round(localStorageSize / 1024)} KB`;
            }
        } catch (e) {
            const localStorageEl = document.getElementById('local-storage-usage');
            if (localStorageEl) localStorageEl.textContent = 'Unbekannt';
        }

        // Session Storage
        try {
            let sessionStorageSize = 0;
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const value = sessionStorage.getItem(key);
                sessionStorageSize += key.length + (value ? value.length : 0);
            }

            const sessionStorageEl = document.getElementById('session-storage-usage');
            if (sessionStorageEl) {
                sessionStorageEl.textContent = `${Math.round(sessionStorageSize / 1024)} KB`;
            }
        } catch (e) {
            const sessionStorageEl = document.getElementById('session-storage-usage');
            if (sessionStorageEl) sessionStorageEl.textContent = 'Unbekannt';
        }

        // Cache API support
        const cacheStatusEl = document.getElementById('cache-api-status');
        if (cacheStatusEl) {
            cacheStatusEl.textContent = 'caches' in window ? 'Unterstützt' : 'Nicht unterstützt';
        }
    }

    // Modal functionality
    async viewImportDetails(importId) {
        if (window.showLoading) window.showLoading();

        setTimeout(() => {
            if (window.hideLoading) window.hideLoading();

            const content = document.getElementById('import-details-content');
            if (content) {
                content.innerHTML = `
                    <div class="import-details">
                        <h4>Import #${importId}</h4>
                        <p>Detaillierte Informationen zu diesem Import werden geladen...</p>
                        <p><small>Diese Funktion erfordert zusätzliche API-Endpunkte im WebEPG-Backend.</small></p>
                    </div>
                `;
            }

            const modal = document.getElementById('import-details-modal');
            if (modal) modal.classList.add('active');
        }, 500);
    }

    viewAllImports() {
        window.showToast?.('Alle Importe anzeigen - noch nicht implementiert', 'info');
    }

    closeModal() {
        const modal = document.getElementById('import-details-modal');
        if (modal) modal.classList.remove('active');
    }

    // Event listeners for online/offline status
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            const onlineStatusEl = document.getElementById('online-status');
            if (onlineStatusEl) onlineStatusEl.textContent = 'Online';
            window.showToast?.('Verbindung wieder hergestellt', 'success');
        });

        window.addEventListener('offline', () => {
            const onlineStatusEl = document.getElementById('online-status');
            if (onlineStatusEl) onlineStatusEl.textContent = 'Offline';
            window.showToast?.('Verbindung verloren', 'error');
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const monitoringManager = new MonitoringManager();
    monitoringManager.init();

    // Make available globally if needed
    window.monitoringManager = monitoringManager;

    // Set up network listeners
    monitoringManager.setupNetworkListeners();
});
