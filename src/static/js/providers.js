// Ultimate UI - EPG Provider Management JavaScript

class ProviderManager {
    constructor() {
        this.providers = [];
        this.importLogs = [];
        this.currentView = 'table';
        this.currentModal = null;
        this.initialized = false;
        this.webepgBaseUrl = '';
        this.loadConfig();
    }

    loadConfig() {
        // Try to get WebEPG URL from config
        try {
            // Check if we have config data from the config page
            if (window.CONFIG_DATA && window.CONFIG_DATA.webepg && window.CONFIG_DATA.webepg.url) {
                this.webepgBaseUrl = window.CONFIG_DATA.webepg.url;
            } else {
                // Try to get from localStorage or form
                const webepgUrlInput = document.getElementById('webepg_url');
                if (webepgUrlInput) {
                    this.webepgBaseUrl = webepgUrlInput.value;
                }
            }
            
            // Remove trailing slash if present
            this.webepgBaseUrl = this.webepgBaseUrl.replace(/\/$/, '');
            
            console.log('Using WebEPG base URL:', this.webepgBaseUrl);
        } catch (error) {
            console.warn('Could not load WebEPG URL from config:', error);
        }
    }

    async init() {
        if (this.initialized) return;

        this.setupEventListeners();
        await this.loadProviders();
        await this.loadImportLogs();
        this.updateStatistics();

        this.initialized = true;
    }

    setupEventListeners() {
        // Add provider button
        document.getElementById('add-provider-btn')?.addEventListener('click', () => this.showAddProviderModal());
        document.getElementById('add-first-provider-btn')?.addEventListener('click', () => this.showAddProviderModal());

        // Action buttons
        document.getElementById('test-all-btn')?.addEventListener('click', () => this.testAllConnections());
        document.getElementById('import-all-btn')?.addEventListener('click', () => this.importAllEnabled());
        document.getElementById('refresh-providers-btn')?.addEventListener('click', () => this.refreshData());

        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e.target.getAttribute('data-view')));
        });

        // Search input
        const searchInput = document.getElementById('provider-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterProviders(e.target.value));
        }
    }

    async loadProviders() {
        try {
            if (window.showLoading) window.showLoading('Loading providers...');
            
            // Use WebEPG backend URL
            const url = this.getApiUrl('/api/v1/providers');
            const data = await this.makeRequest(url);
            this.providers = data || [];
            this.renderProviders();
        } catch (error) {
            console.error('Error loading providers:', error);
            if (window.showToast) window.showToast('Failed to load providers. Check WebEPG backend configuration.', 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async loadImportLogs() {
        try {
            // Use WebEPG backend URL
            const url = this.getApiUrl('/api/v1/import/status');
            const data = await this.makeRequest(url);
            this.importLogs = data?.recent_imports || [];
        } catch (error) {
            console.error('Error loading import logs:', error);
            // Don't show toast for this, it's not critical
        }
    }

    getApiUrl(endpoint) {
        // If we have a WebEPG base URL, use it
        if (this.webepgBaseUrl) {
            return `${this.webepgBaseUrl}${endpoint}`;
        }
        
        // Otherwise, try to use relative URL (might work if CORS is enabled)
        return endpoint;
    }

    async makeRequest(url, options = {}) {
        try {
            // Add timeout to options
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            console.error('Request failed:', error);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            throw error;
        }
    }

    async postData(url, data) {
        return await this.makeRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
    }

    async putData(url, data) {
        return await this.makeRequest(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
    }

    async deleteData(url) {
        return await this.makeRequest(url, {
            method: 'DELETE'
        });
    }

    getProviderImportLogs(providerId) {
        return this.importLogs
            .filter(log => log.provider_id === providerId)
            .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    }

    getLatestImportLog(providerId) {
        const logs = this.getProviderImportLogs(providerId);
        return logs.length > 0 ? logs[0] : null;
    }

    renderProviders() {
        this.renderTableView();
        this.renderCardsView();
        this.toggleEmptyState();
    }

    renderTableView() {
        const tbody = document.getElementById('providers-table-body');
        if (!tbody) return;

        if (this.providers.length === 0) {
            tbody.innerHTML = '';
            return;
        }

        let html = '';
        
        this.providers.forEach(provider => {
            const latestImport = this.getLatestImportLog(provider.id);
            
            html += `
                <tr data-provider-id="${provider.id}">
                    <td>
                        <div class="provider-status">
                            <span class="status-dot ${provider.enabled ? 'enabled' : 'disabled'}"></span>
                            <span class="status-text">${provider.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                    </td>
                    <td>
                        <strong>${this.escapeHtml(provider.name)}</strong>
                        <br>
                        <small class="text-muted">ID: ${provider.id}</small>
                    </td>
                    <td>
                        <div class="provider-url">
                            <span class="url-text" title="${this.escapeHtml(provider.xmltv_url)}">
                                ${this.escapeHtml(this.truncateUrl(provider.xmltv_url))}
                            </span>
                            <button class="btn-copy" onclick="navigator.clipboard.writeText('${this.escapeHtml(provider.xmltv_url)}'); window.showToast('URL copied to clipboard', 'success')" title="Copy URL">
                                📋
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="last-import">
                            ${latestImport ? `
                                <span class="import-time">${this.formatRelativeTime(latestImport.completed_at || latestImport.started_at)}</span>
                                <span class="import-status ${latestImport.status}">${latestImport.status}</span>
                            ` : '<span class="text-muted">Never</span>'}
                        </div>
                    </td>
                    <td>
                        ${latestImport ? `
                            <div class="import-stats">
                                <div class="stats-row">
                                    <span>Imported:</span>
                                    <strong>${latestImport.programs_imported || 0}</strong>
                                </div>
                                <div class="stats-row">
                                    <span>Skipped:</span>
                                    <strong>${latestImport.programs_skipped || 0}</strong>
                                </div>
                            </div>
                        ` : '<span class="text-muted">No data</span>'}
                    </td>
                    <td class="text-center">
                        <div class="provider-actions">
                            <button class="action-btn edit" onclick="window.providerManager.showEditProviderModal(${provider.id})" title="Edit Provider">
                                ✏️
                            </button>
                            <button class="action-btn test" onclick="window.providerManager.testProviderConnection(${provider.id})" title="Test Connection">
                                🔍
                            </button>
                            <button class="action-btn import" onclick="window.providerManager.triggerProviderImport(${provider.id})" title="Trigger Import">
                                🔄
                            </button>
                            <button class="action-btn toggle" onclick="window.providerManager.toggleProviderStatus(${provider.id}, ${!provider.enabled})" title="${provider.enabled ? 'Disable' : 'Enable'} Provider">
                                ${provider.enabled ? '⏸️' : '▶️'}
                            </button>
                            <button class="action-btn delete" onclick="window.providerManager.deleteProvider(${provider.id})" title="Delete Provider">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    renderCardsView() {
        const cardsGrid = document.getElementById('providers-cards-grid');
        if (!cardsGrid) return;

        if (this.providers.length === 0) {
            cardsGrid.innerHTML = '';
            return;
        }

        let html = '';
        
        this.providers.forEach(provider => {
            const latestImport = this.getLatestImportLog(provider.id);
            
            html += `
                <div class="provider-card" data-provider-id="${provider.id}">
                    <div class="card-header">
                        <div class="card-title">
                            <span class="card-name">${this.escapeHtml(provider.name)}</span>
                            <span class="card-id">#${provider.id}</span>
                        </div>
                        <div class="provider-status">
                            <span class="status-dot ${provider.enabled ? 'enabled' : 'disabled'}"></span>
                            <span class="status-text">${provider.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                    </div>
                    
                    <div class="card-url" title="${this.escapeHtml(provider.xmltv_url)}">
                        ${this.escapeHtml(this.truncateUrl(provider.xmltv_url, 50))}
                    </div>
                    
                    <div class="card-details">
                        <div class="detail-item">
                            <span class="detail-label">Last Import</span>
                            <span class="detail-value">
                                ${latestImport ? this.formatRelativeTime(latestImport.completed_at || latestImport.started_at) : 'Never'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">
                                ${latestImport ? `<span class="import-status ${latestImport.status}">${latestImport.status}</span>` : 'N/A'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Imported</span>
                            <span class="detail-value">
                                ${latestImport ? (latestImport.programs_imported || 0) : '0'}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Skipped</span>
                            <span class="detail-value">
                                ${latestImport ? (latestImport.programs_skipped || 0) : '0'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="card-actions">
                        <button class="card-btn secondary" onclick="window.providerManager.showEditProviderModal(${provider.id})">
                            ✏️ Edit
                        </button>
                        <button class="card-btn secondary" onclick="window.providerManager.testProviderConnection(${provider.id})">
                            🔍 Test
                        </button>
                        <button class="card-btn primary" onclick="window.providerManager.triggerProviderImport(${provider.id})">
                            🔄 Import
                        </button>
                    </div>
                </div>
            `;
        });

        cardsGrid.innerHTML = html;
    }

    toggleEmptyState() {
        const emptyState = document.getElementById('empty-state');
        const tableView = document.getElementById('table-view');
        const cardsView = document.getElementById('cards-view');

        if (this.providers.length === 0) {
            emptyState.classList.remove('hidden');
            tableView.classList.add('hidden');
            cardsView.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tableView.classList.remove('hidden');
            cardsView.classList.remove('hidden');
        }
    }

    updateStatistics() {
        const total = this.providers.length;
        const enabled = this.providers.filter(p => p.enabled).length;
        const disabled = total - enabled;
        
        // Calculate success rate from import logs
        const successfulImports = this.importLogs.filter(log => log.status === 'success').length;
        const totalImports = this.importLogs.length;
        const successRate = totalImports > 0 ? Math.round((successfulImports / totalImports) * 100) : 0;

        document.getElementById('total-providers').textContent = total;
        document.getElementById('enabled-providers').textContent = enabled;
        document.getElementById('disabled-providers').textContent = disabled;
        document.getElementById('success-rate').textContent = `${successRate}%`;
    }

    switchView(view) {
        this.currentView = view;
        
        // Update buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === view);
        });
        
        // Show/hide views
        const tableView = document.getElementById('table-view');
        const cardsView = document.getElementById('cards-view');
        
        if (view === 'table') {
            tableView.classList.add('active');
            cardsView.classList.remove('active');
        } else {
            tableView.classList.remove('active');
            cardsView.classList.add('active');
        }
    }

    filterProviders(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        
        // Filter table rows
        document.querySelectorAll('#providers-table-body tr[data-provider-id]').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
        
        // Filter cards
        document.querySelectorAll('.provider-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(term) ? '' : 'none';
        });
    }

    showAddProviderModal() {
        // First check if we have a WebEPG URL configured
        if (!this.webepgBaseUrl) {
            this.showConfigWarning();
            return;
        }
        
        const modal = UTILS.UIComponents.createModal({
            title: 'Add New EPG Provider',
            content: `
                <form id="add-provider-form" class="modal-form">
                    <div class="form-group">
                        <label for="provider-name">Provider Name *</label>
                        <input type="text" id="provider-name" class="form-input" required 
                               placeholder="e.g., My EPG Source">
                    </div>
                    <div class="form-group">
                        <label for="provider-url">XMLTV URL *</label>
                        <input type="url" id="provider-url" class="form-input" required 
                               placeholder="https://example.com/epg.xml">
                        <small class="text-muted">Full URL to the XMLTV file</small>
                    </div>
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" id="provider-enabled" checked>
                            <label for="provider-enabled" class="checkbox-label">
                                Enable provider (import data automatically)
                            </label>
                        </div>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                },
                {
                    text: 'Test Connection',
                    className: 'modal-btn secondary',
                    onClick: () => this.testNewProviderConnection()
                },
                {
                    text: 'Save Provider',
                    className: 'modal-btn primary',
                    onClick: () => this.saveNewProvider()
                }
            ]
        });
        
        this.currentModal = modal;
    }

    showConfigWarning() {
        UTILS.UIComponents.createModal({
            title: 'Configuration Required',
            content: `
                <div style="padding: 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                    <h3>WebEPG Backend Not Configured</h3>
                    <p>Please configure the WebEPG backend URL in the Configuration tab first.</p>
                    <p>Go to: <strong>Configuration → Backend-Einstellungen → WebEPG Backend</strong></p>
                </div>
            `,
            buttons: [
                {
                    text: 'Go to Configuration',
                    className: 'modal-btn primary',
                    onClick: () => {
                        window.location.href = '/configuration';
                    }
                },
                {
                    text: 'Cancel',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                }
            ]
        });
    }

    async testNewProviderConnection() {
        const name = document.getElementById('provider-name')?.value;
        const url = document.getElementById('provider-url')?.value;
        
        if (!name || !url) {
            if (window.showToast) window.showToast('Please enter provider name and URL', 'warning');
            return;
        }
        
        // Create a simple test by fetching the URL
        try {
            if (window.showLoading) window.showLoading('Testing connection...');
            const response = await fetch(url, { method: 'HEAD' });
            
            if (response.ok) {
                if (window.showToast) window.showToast('Connection successful! XMLTV URL is accessible.', 'success');
            } else {
                if (window.showToast) window.showToast(`Connection failed: ${response.status} ${response.statusText}`, 'error');
            }
        } catch (error) {
            if (window.showToast) window.showToast(`Connection error: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async saveNewProvider() {
        const name = document.getElementById('provider-name')?.value;
        const url = document.getElementById('provider-url')?.value;
        const enabled = document.getElementById('provider-enabled')?.checked;
        
        if (!name || !url) {
            if (window.showToast) window.showToast('Please fill in all required fields', 'warning');
            return;
        }
        
        try {
            if (window.showLoading) window.showLoading('Saving provider...');
            
            const apiUrl = this.getApiUrl('/api/v1/providers');
            await this.postData(apiUrl, {
                name: name,
                xmltv_url: url,
                enabled: enabled
            });
            
            if (window.showToast) window.showToast('Provider added successfully!', 'success');
            
            // Close modal and refresh data
            if (this.currentModal) {
                this.currentModal.close();
            }
            
            await this.refreshData();
            
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to add provider: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async showEditProviderModal(providerId) {
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;
        
        const modal = UTILS.UIComponents.createModal({
            title: 'Edit EPG Provider',
            content: `
                <form id="edit-provider-form" class="modal-form">
                    <div class="form-group">
                        <label for="edit-provider-name">Provider Name *</label>
                        <input type="text" id="edit-provider-name" class="form-input" required 
                               value="${this.escapeHtml(provider.name)}">
                    </div>
                    <div class="form-group">
                        <label for="edit-provider-url">XMLTV URL *</label>
                        <input type="url" id="edit-provider-url" class="form-input" required 
                               value="${this.escapeHtml(provider.xmltv_url)}">
                    </div>
                    <div class="form-group">
                        <div class="checkbox-group">
                            <input type="checkbox" id="edit-provider-enabled" ${provider.enabled ? 'checked' : ''}>
                            <label for="edit-provider-enabled" class="checkbox-label">
                                Enable provider
                            </label>
                        </div>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                },
                {
                    text: 'Test Connection',
                    className: 'modal-btn secondary',
                    onClick: () => this.testEditProviderConnection(providerId)
                },
                {
                    text: 'Save Changes',
                    className: 'modal-btn primary',
                    onClick: () => this.updateProvider(providerId)
                }
            ]
        });
        
        this.currentModal = modal;
    }

    async testEditProviderConnection(providerId) {
        const url = document.getElementById('edit-provider-url')?.value;
        
        if (!url) {
            if (window.showToast) window.showToast('Please enter a URL', 'warning');
            return;
        }
        
        await this.testProviderConnection(providerId, url);
    }

    async updateProvider(providerId) {
        const name = document.getElementById('edit-provider-name')?.value;
        const url = document.getElementById('edit-provider-url')?.value;
        const enabled = document.getElementById('edit-provider-enabled')?.checked;
        
        if (!name || !url) {
            if (window.showToast) window.showToast('Please fill in all required fields', 'warning');
            return;
        }
        
        try {
            if (window.showLoading) window.showLoading('Updating provider...');
            
            const apiUrl = this.getApiUrl(`/api/v1/providers/${providerId}`);
            await this.putData(apiUrl, {
                name: name,
                xmltv_url: url,
                enabled: enabled
            });
            
            if (window.showToast) window.showToast('Provider updated successfully!', 'success');
            
            // Close modal and refresh data
            if (this.currentModal) {
                this.currentModal.close();
            }
            
            await this.refreshData();
            
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to update provider: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async toggleProviderStatus(providerId, enabled) {
        try {
            const provider = this.providers.find(p => p.id === providerId);
            if (!provider) return;
            
            if (window.showLoading) window.showLoading(`${enabled ? 'Enabling' : 'Disabling'} provider...`);
            
            const apiUrl = this.getApiUrl(`/api/v1/providers/${providerId}`);
            await this.putData(apiUrl, {
                name: provider.name,
                xmltv_url: provider.xmltv_url,
                enabled: enabled
            });
            
            if (window.showToast) window.showToast(`Provider ${enabled ? 'enabled' : 'disabled'} successfully!`, 'success');
            await this.refreshData();
            
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to update provider status: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async deleteProvider(providerId) {
        if (!confirm('Are you sure you want to delete this provider? This action cannot be undone.')) {
            return;
        }
        
        try {
            if (window.showLoading) window.showLoading('Deleting provider...');
            
            const apiUrl = this.getApiUrl(`/api/v1/providers/${providerId}`);
            await this.deleteData(apiUrl);
            
            if (window.showToast) window.showToast('Provider deleted successfully!', 'success');
            await this.refreshData();
            
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to delete provider: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async testProviderConnection(providerId, customUrl = null) {
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) return;
        
        const url = customUrl || provider.xmltv_url;
        
        // Show test modal
        const modal = UTILS.UIComponents.createModal({
            title: 'Test Connection',
            content: `
                <div class="test-status testing">
                    <div class="loading-spinner-small"></div>
                    <span>Testing connection to: ${this.escapeHtml(this.truncateUrl(url, 50))}</span>
                </div>
                <div class="test-details" id="test-details">Starting test...</div>
            `,
            buttons: [
                {
                    text: 'Close',
                    className: 'modal-btn secondary',
                    closeOnClick: true
                }
            ],
            backdropClose: false
        });
        
        try {
            const startTime = Date.now();
            
            // First, try HEAD request
            const response = await fetch(url, { method: 'HEAD' });
            const headTime = Date.now() - startTime;
            
            let details = `HEAD request: ${response.status} ${response.statusText}\n`;
            details += `Response time: ${headTime}ms\n\n`;
            
            if (response.ok) {
                // Try to get first few KB to verify it's XMLTV
                const contentResponse = await fetch(url);
                const text = await contentResponse.text();
                const totalTime = Date.now() - startTime;
                
                details += `Content type: ${contentResponse.headers.get('content-type')}\n`;
                details += `Total size: ${text.length} characters\n`;
                details += `Total time: ${totalTime}ms\n\n`;
                
                // Check if it looks like XMLTV
                if (text.includes('<?xml') && (text.includes('<tv>') || text.includes('<!DOCTYPE tv'))) {
                    details += '✓ Valid XMLTV format detected\n';
                    
                    modal.updateContent(`
                        <div class="test-status success">
                            <span>✅ Connection successful!</span>
                        </div>
                        <div class="test-details">${details}</div>
                    `);
                    
                    if (window.showToast) window.showToast('Connection test successful!', 'success');
                } else {
                    details += '⚠️ Warning: Content does not appear to be valid XMLTV\n';
                    
                    modal.updateContent(`
                        <div class="test-status error">
                            <span>⚠️ Connection successful but content may not be XMLTV</span>
                        </div>
                        <div class="test-details">${details}</div>
                    `);
                    
                    if (window.showToast) window.showToast('Connected but content may not be XMLTV', 'warning');
                }
            } else {
                details += `✗ Failed: ${response.status} ${response.statusText}`;
                
                modal.updateContent(`
                    <div class="test-status error">
                        <span>❌ Connection failed</span>
                    </div>
                    <div class="test-details">${details}</div>
                `);
                
                if (window.showToast) window.showToast(`Connection failed: ${response.status}`, 'error');
            }
            
        } catch (error) {
            modal.updateContent(`
                <div class="test-status error">
                    <span>❌ Connection error</span>
                </div>
                <div class="test-details">${error.message}</div>
            `);
            
            if (window.showToast) window.showToast(`Connection error: ${error.message}`, 'error');
        }
    }

    async triggerProviderImport(providerId) {
        try {
            if (window.showLoading) window.showLoading('Triggering import...');
            
            // Note: You'll need to implement this endpoint in WebEPG backend
            const apiUrl = this.getApiUrl(`/api/v1/providers/${providerId}/import/trigger`);
            await this.postData(apiUrl, {});
            
            if (window.showToast) window.showToast('Import triggered successfully!', 'success');
            
            // Wait a bit and refresh to see import status
            setTimeout(() => this.refreshData(), 2000);
            
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to trigger import: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async testAllConnections() {
        try {
            if (window.showLoading) window.showLoading('Testing all provider connections...');
            
            const enabledProviders = this.providers.filter(p => p.enabled);
            let successful = 0;
            let failed = 0;
            
            for (const provider of enabledProviders) {
                try {
                    const response = await fetch(provider.xmltv_url, { method: 'HEAD' });
                    if (response.ok) {
                        successful++;
                    } else {
                        failed++;
                    }
                } catch {
                    failed++;
                }
            }
            
            const message = `Connection test complete: ${successful} successful, ${failed} failed`;
            if (window.showToast) {
                window.showToast(message, 
                    failed === 0 ? 'success' : failed === enabledProviders.length ? 'error' : 'warning');
            }
                     
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to test connections: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async importAllEnabled() {
        if (!confirm('Trigger import for all enabled providers? This may take several minutes.')) {
            return;
        }
        
        try {
            if (window.showLoading) window.showLoading('Triggering import for all enabled providers...');
            
            const apiUrl = this.getApiUrl('/api/v1/import/trigger');
            await this.postData(apiUrl, {});
            
            if (window.showToast) window.showToast('Import triggered for all enabled providers!', 'success');
            
            // Wait and refresh to see import status
            setTimeout(() => this.refreshData(), 3000);
            
        } catch (error) {
            if (window.showToast) window.showToast(`Failed to trigger import: ${error.message}`, 'error');
        } finally {
            if (window.hideLoading) window.hideLoading();
        }
    }

    async refreshData() {
        await this.loadProviders();
        await this.loadImportLogs();
        this.updateStatistics();
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateUrl(url, maxLength = 40) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }

    formatRelativeTime(dateString) {
        if (!dateString) return 'Never';
        
        try {
            if (window.UTILS && window.UTILS.DateTime) {
                return window.UTILS.DateTime.format(dateString, 'relative');
            }
            
            // Fallback implementation
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins} minutes ago`;
            if (diffHours < 24) return `${diffHours} hours ago`;
            if (diffDays < 7) return `${diffDays} days ago`;
            
            return date.toLocaleDateString();
        } catch {
            return dateString;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const providerManager = new ProviderManager();
    providerManager.init();
    
    // Make available globally
    window.providerManager = providerManager;
});
