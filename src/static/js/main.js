/**
 * Ultimate UI - Main JavaScript
 * Provides common utilities, API calls, and UI interactions
 */

// API Base URL (relative to current origin)
const API_BASE = '';

// Cache for API responses
const cache = {
    data: new Map(),
    timestamps: new Map(),

    get(key) {
        const item = this.data.get(key);
        const timestamp = this.timestamps.get(key);

        if (!item || !timestamp) return null;

        // Check if cache is still valid (5 minutes default)
        const now = Date.now();
        const age = now - timestamp;
        const maxAge = 5 * 60 * 1000; // 5 minutes

        if (age > maxAge) {
            this.data.delete(key);
            this.timestamps.delete(key);
            return null;
        }

        return item;
    },

    set(key, data) {
        this.data.set(key, data);
        this.timestamps.set(key, Date.now());
    },

    clear() {
        this.data.clear();
        this.timestamps.clear();
    },

    remove(key) {
        this.data.delete(key);
        this.timestamps.delete(key);
    }
};

// Toast notification system
class Toast {
    static show(message, type = 'info', duration = 3000) {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => {
            if (toast.classList.contains('show')) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        });

        // Create new toast
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${this.getBackgroundColor(type)};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            transform: translateX(150%);
            transition: transform 0.3s ease;
            max-width: 350px;
            word-wrap: break-word;
            font-size: 14px;
        `;

        document.body.appendChild(toast);

        // Show toast
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Auto-remove after duration
        setTimeout(() => {
            toast.style.transform = 'translateX(150%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);

        // Click to dismiss
        toast.addEventListener('click', () => {
            toast.style.transform = 'translateX(150%)';
            setTimeout(() => toast.remove(), 300);
        });

        return toast;
    }

    static getBackgroundColor(type) {
        const colors = {
            success: '#4caf50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196f3'
        };
        return colors[type] || colors.info;
    }
}

// Loading spinner management
class LoadingSpinner {
    static show(message = '') {
        let spinner = document.getElementById('global-loading-spinner');

        if (!spinner) {
            spinner = document.createElement('div');
            spinner.id = 'global-loading-spinner';
            spinner.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            `;

            const spinnerIcon = document.createElement('div');
            spinnerIcon.style.cssText = `
                width: 50px;
                height: 50px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            `;

            const spinnerText = document.createElement('div');
            spinnerText.id = 'loading-spinner-text';
            spinnerText.style.cssText = `
                color: white;
                margin-top: 20px;
                font-size: 14px;
                text-align: center;
                max-width: 300px;
            `;

            // Add CSS animation if not already present
            if (!document.querySelector('#spinner-styles')) {
                const style = document.createElement('style');
                style.id = 'spinner-styles';
                style.textContent = `
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            }

            spinner.appendChild(spinnerIcon);
            spinner.appendChild(spinnerText);
            document.body.appendChild(spinner);
        }

        if (message) {
            document.getElementById('loading-spinner-text').textContent = message;
        }

        spinner.style.display = 'flex';
    }

    static hide() {
        const spinner = document.getElementById('global-loading-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
}

// API Client
class APIClient {
    static async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin'
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);

            // Handle HTTP errors
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.response = response;
                throw error;
            }

            // Parse JSON response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();

        } catch (error) {
            console.error('API request failed:', error);

            // Show user-friendly error message
            if (error.status === 0) {
                Toast.show('Netzwerkfehler: Bitte überprüfen Sie Ihre Internetverbindung', 'error');
            } else if (error.status === 404) {
                Toast.show('API-Endpunkt nicht gefunden', 'error');
            } else if (error.status === 500) {
                Toast.show('Serverfehler: Bitte versuchen Sie es später erneut', 'error');
            } else {
                Toast.show(`Fehler: ${error.message}`, 'error');
            }

            throw error;
        }
    }

    static async get(endpoint, useCache = true) {
        if (useCache) {
            const cached = cache.get(endpoint);
            if (cached) {
                return cached;
            }
        }

        const data = await this.request(endpoint);

        if (useCache) {
            cache.set(endpoint, data);
        }

        return data;
    }

    static async post(endpoint, data) {
        const options = {
            method: 'POST',
            body: JSON.stringify(data)
        };

        // Clear cache for related endpoints
        this.clearRelatedCache(endpoint);

        return await this.request(endpoint, options);
    }

    static async put(endpoint, data) {
        const options = {
            method: 'PUT',
            body: JSON.stringify(data)
        };

        this.clearRelatedCache(endpoint);

        return await this.request(endpoint, options);
    }

    static async delete(endpoint) {
        const options = {
            method: 'DELETE'
        };

        this.clearRelatedCache(endpoint);

        return await this.request(endpoint, options);
    }

    static clearRelatedCache(endpoint) {
        // Clear cache for endpoints that might be affected by this change
        const relatedEndpoints = Array.from(cache.data.keys()).filter(key =>
            key.includes(endpoint.split('/')[1]) || // Same resource type
            endpoint.includes(key.split('/')[1])   // Resource type in endpoint
        );

        relatedEndpoints.forEach(key => cache.remove(key));
    }
}

// Theme management
class ThemeManager {
    static init() {
        // Load saved theme or detect system preference
        const savedTheme = localStorage.getItem('ultimate-ui-theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        let theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

        this.applyTheme(theme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('ultimate-ui-theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    static applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('ultimate-ui-theme', theme);

        // Update theme switcher if it exists
        const switcher = document.getElementById('theme-switcher');
        if (switcher) {
            switcher.checked = theme === 'dark';
        }
    }

    static toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        Toast.show(`Theme geändert zu: ${newTheme === 'dark' ? 'Dunkel' : 'Hell'}`, 'success');
    }
}

// Local storage wrapper with expiration
class Storage {
    static set(key, value, ttl = null) {
        const item = {
            value: value,
            expiry: ttl ? Date.now() + ttl : null
        };
        localStorage.setItem(key, JSON.stringify(item));
    }

    static get(key) {
        const itemStr = localStorage.getItem(key);

        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);

            // Check if item has expired
            if (item.expiry && Date.now() > item.expiry) {
                localStorage.removeItem(key);
                return null;
            }

            return item.value;
        } catch (_e) {
            // If item is not valid JSON, return raw value
            return itemStr;
        }
    }

    static remove(key) {
        localStorage.removeItem(key);
    }

    static clear() {
        localStorage.clear();
    }
}

// Form validation utilities
class FormValidator {
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validateURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static validateRequired(fields) {
        return fields.every(field => {
            const value = field.value ? field.value.trim() : '';
            return value !== '';
        });
    }

    static showFieldError(field, message) {
        // Remove existing error
        this.clearFieldError(field);

        // Add error class
        field.classList.add('error');

        // Create error message element
        const errorEl = document.createElement('div');
        errorEl.className = 'field-error';
        errorEl.textContent = message;
        errorEl.style.cssText = `
            color: #f44336;
            font-size: 12px;
            margin-top: 4px;
        `;

        field.parentNode.appendChild(errorEl);

        // Focus the field
        field.focus();
    }

    static clearFieldError(field) {
        field.classList.remove('error');

        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
    }
}

// Date and time utilities
class DateTime {
    static format(date, format = 'datetime') {
        const d = new Date(date);

        const formats = {
            date: d.toLocaleDateString('de-DE', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }),
            time: d.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            datetime: d.toLocaleString('de-DE', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }),
            relative: this.getRelativeTime(d)
        };

        return formats[format] || formats.datetime;
    }

    static getRelativeTime(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `Vor ${diffMins} Minuten`;
        if (diffHours < 24) return `Vor ${diffHours} Stunden`;
        if (diffDays < 7) return `Vor ${diffDays} Tagen`;

        return this.format(date, 'date');
    }

    static getTimeRemaining(targetDate) {
        const now = new Date();
        const target = new Date(targetDate);
        const diffMs = target - now;

        if (diffMs <= 0) return { expired: true };

        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        return {
            days,
            hours,
            minutes,
            seconds,
            total: diffMs,
            expired: false
        };
    }
}

// UI Components
class UIComponents {
    static createModal(options = {}) {
        const {
            title = '',
            content = '',
            size = 'medium', // small, medium, large
            showClose = true,
            backdropClose = true,
            buttons = []
        } = options;

        // Remove existing modal
        const existingModal = document.getElementById('dynamic-modal');
        if (existingModal) existingModal.remove();

        // Create modal container
        const modal = document.createElement('div');
        modal.id = 'dynamic-modal';
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        `;

        // Determine modal size
        const sizeMap = {
            small: '400px',
            medium: '600px',
            large: '800px'
        };
        const modalWidth = sizeMap[size] || sizeMap.medium;

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.cssText = `
            background: var(--bg-secondary);
            border-radius: 12px;
            width: 100%;
            max-width: ${modalWidth};
            max-height: 80vh;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        `;

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header';
        modalHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid var(--border-color);
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.margin = '0';

        modalHeader.appendChild(titleEl);

        if (showClose) {
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.className = 'modal-close';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: background-color 0.2s;
                color: var(--text-primary);
            `;
            closeBtn.addEventListener('click', () => this.closeModal());
            closeBtn.addEventListener('mouseover', () => {
                closeBtn.style.backgroundColor = 'var(--bg-tertiary)';
            });
            closeBtn.addEventListener('mouseout', () => {
                closeBtn.style.backgroundColor = 'transparent';
            });
            modalHeader.appendChild(closeBtn);
        }

        // Create modal body
        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body';
        modalBody.style.cssText = `
            padding: 20px;
            overflow-y: auto;
            max-height: calc(80vh - 140px);
        `;

        if (typeof content === 'string') {
            modalBody.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            modalBody.appendChild(content);
        }

        // Create modal footer with buttons
        let modalFooter = null;
        if (buttons.length > 0) {
            modalFooter = document.createElement('div');
            modalFooter.className = 'modal-footer';
            modalFooter.style.cssText = `
                padding: 20px;
                border-top: 1px solid var(--border-color);
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            `;

            buttons.forEach(button => {
                const btn = document.createElement('button');
                btn.textContent = button.text;
                btn.className = button.className || 'btn-primary';
                btn.style.cssText = `
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: none;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                `;

                if (button.className === 'btn-primary') {
                    btn.style.backgroundColor = 'var(--accent-color)';
                    btn.style.color = 'white';
                } else {
                    btn.style.backgroundColor = 'var(--bg-tertiary)';
                    btn.style.color = 'var(--text-primary)';
                    btn.style.border = '1px solid var(--border-color)';
                }

                btn.addEventListener('click', (e) => {
                    if (button.onClick) button.onClick(e);
                    if (button.closeOnClick !== false) this.closeModal();
                });

                modalFooter.appendChild(btn);
            });
        }

        // Assemble modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        if (modalFooter) modalContent.appendChild(modalFooter);
        modal.appendChild(modalContent);

        // Add backdrop close functionality
        if (backdropClose) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }

        // Add escape key close
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Store reference to remove event listener later
        modal._escapeHandler = handleEscape;

        // Add to document
        document.body.appendChild(modal);

        // Return modal instance for further manipulation
        return {
            element: modal,
            close: () => this.closeModal(),
            updateContent: (newContent) => {
                modalBody.innerHTML = '';
                if (typeof newContent === 'string') {
                    modalBody.innerHTML = newContent;
                } else if (newContent instanceof HTMLElement) {
                    modalBody.appendChild(newContent);
                }
            }
        };
    }

    static closeModal() {
        const modal = document.getElementById('dynamic-modal');
        if (modal) {
            // Remove escape key listener
            if (modal._escapeHandler) {
                document.removeEventListener('keydown', modal._escapeHandler);
            }
            modal.remove();
        }
    }

    static createDropdown(options) {
        const {
            trigger,
            items = [],
            position = 'bottom-right',
            onSelect = () => {}
        } = options;

        // Remove existing dropdown
        const existingDropdown = document.getElementById('dynamic-dropdown');
        if (existingDropdown) existingDropdown.remove();

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.id = 'dynamic-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 1000;
            min-width: 160px;
            overflow: hidden;
        `;

        // Position dropdown
        const triggerRect = trigger.getBoundingClientRect();
        const positions = {
            'bottom-right': {
                top: triggerRect.bottom + 5,
                left: triggerRect.right - 160
            },
            'bottom-left': {
                top: triggerRect.bottom + 5,
                left: triggerRect.left
            },
            'top-right': {
                bottom: window.innerHeight - triggerRect.top + 5,
                left: triggerRect.right - 160
            },
            'top-left': {
                bottom: window.innerHeight - triggerRect.top + 5,
                left: triggerRect.left
            }
        };

        const pos = positions[position] || positions['bottom-right'];
        dropdown.style.top = `${pos.top}px`;
        dropdown.style.left = `${pos.left}px`;

        // Add items
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'dropdown-item';
            itemEl.textContent = item.text;
            itemEl.style.cssText = `
                padding: 12px 16px;
                cursor: pointer;
                transition: background-color 0.2s;
                white-space: nowrap;
            `;

            itemEl.addEventListener('mouseenter', () => {
                itemEl.style.backgroundColor = 'var(--bg-tertiary)';
            });

            itemEl.addEventListener('mouseleave', () => {
                itemEl.style.backgroundColor = 'transparent';
            });

            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelect(item);
                dropdown.remove();
            });

            dropdown.appendChild(itemEl);
        });

        // Add to document
        document.body.appendChild(dropdown);

        // Close dropdown when clicking outside
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeDropdown);
        }, 10);

        return dropdown;
    }
}

// Keyboard shortcut manager
class KeyboardManager {
    static shortcuts = new Map();

    static register(shortcut, callback, options = {}) {
        const { preventDefault = true, description = '' } = options;

        this.shortcuts.set(shortcut.toLowerCase(), {
            callback,
            preventDefault,
            description
        });
    }

    static unregister(shortcut) {
        this.shortcuts.delete(shortcut.toLowerCase());
    }

    static init() {
        document.addEventListener('keydown', (e) => {
            // Skip if only modifier keys are pressed without a regular key
            const isModifierOnly = (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) &&
                                   !e.key ||
                                   ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key);

            if (isModifierOnly) return;

            // Build shortcut string
            const parts = [];
            if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
            if (e.altKey) parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');

            if (e.key) {
                parts.push(e.key.toUpperCase());

                const shortcut = parts.join('+');
                const handler = this.shortcuts.get(shortcut.toLowerCase());

                if (handler) {
                    if (handler.preventDefault) {
                        e.preventDefault();
                    }
                    handler.callback(e);
                }
            }
        });
    }
    static getHelp() {
        const help = [];
        this.shortcuts.forEach((value, key) => {
            help.push({
                shortcut: key.toUpperCase(),
                description: value.description
            });
        });
        return help;
    }
}

// Export utilities to global scope
window.UTILS = {
    Toast,
    LoadingSpinner,
    APIClient,
    ThemeManager,
    Storage,
    FormValidator,
    DateTime,
    UIComponents,
    KeyboardManager,
    cache
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    ThemeManager.init();

    // Initialize keyboard shortcuts
    KeyboardManager.init();

    // Register common shortcuts
    KeyboardManager.register('Ctrl+R', () => {
        window.location.reload();
    }, { description: 'Seite neu laden' });

    KeyboardManager.register('Escape', () => {
        UIComponents.closeModal();
    }, { description: 'Modal schließen' });

    // Add global error handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        Toast.show(`Fehler: ${event.error.message}`, 'error');
    });

    // Add unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        Toast.show(`Fehler: ${event.reason.message || event.reason}`, 'error');
    });

    // Add service worker for PWA support (if enabled)
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful:', registration);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    }

    // Update online/offline status
    const updateOnlineStatus = () => {
        const status = navigator.onLine ? 'online' : 'offline';
        document.body.setAttribute('data-connection', status);

        if (status === 'offline') {
            Toast.show('Sie sind offline. Einige Funktionen sind möglicherweise nicht verfügbar.', 'warning', 5000);
        } else {
            Toast.show('Verbindung wiederhergestellt', 'success');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
});

// Utility function to debounce function calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Utility function to throttle function calls
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Export utility functions
window.debounce = debounce;
window.throttle = throttle;

// Make Toast available globally for easy use
window.showToast = (message, type, duration) => Toast.show(message, type, duration);
window.showLoading = (message) => LoadingSpinner.show(message);
window.hideLoading = () => LoadingSpinner.hide();