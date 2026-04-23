// ============================================
// Content Shield Extension - Utility Functions
// ============================================

const Utils = {
  // ============================================
  // URL and Domain Utilities
  // ============================================

  /**
   * Extract domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return '';
    }
  },

  /**
   * Extract root domain (removes subdomains)
   * @param {string} url - Full URL or domain
   * @returns {string} Root domain
   */
  getRootDomain(url) {
    try {
      const domain = url.includes('://') ? this.extractDomain(url) : url;
      const parts = domain.split('.');
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return domain;
    } catch (e) {
      return '';
    }
  },

  /**
   * Check if URL matches blocked pattern
   * @param {string} url - URL to check
   * @param {Array} patterns - Array of patterns to match against
   * @returns {boolean} True if matches blocked pattern
   */
  matchesBlockedPattern(url, patterns) {
    const lowerUrl = url.toLowerCase();
    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      if (pattern.startsWith('*') && pattern.endsWith('*')) {
        return lowerUrl.includes(lowerPattern.slice(1, -1));
      } else if (pattern.startsWith('*')) {
        return lowerUrl.endsWith(lowerPattern.slice(1));
      } else if (pattern.endsWith('*')) {
        return lowerUrl.startsWith(lowerPattern.slice(0, -1));
      }
      return lowerUrl.includes(lowerPattern);
    });
  },

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  },

  // ============================================
  // Storage Utilities
  // ============================================

  /**
   * Get data from chrome storage
   * @param {string|Array} keys - Key(s) to retrieve
   * @returns {Promise} Resolves with data
   */
  async getStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  /**
   * Set data in chrome storage
   * @param {Object} data - Data to store
   * @returns {Promise} Resolves when complete
   */
  async setStorage(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  },

  /**
   * Remove data from chrome storage
   * @param {string|Array} keys - Key(s) to remove
   * @returns {Promise} Resolves when complete
   */
  async removeStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => {
        resolve();
      });
    });
  },

  /**
   * Clear all storage
   * @returns {Promise} Resolves when complete
   */
  async clearStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve();
      });
    });
  },

  // ============================================
  // Settings Management
  // ============================================

  /**
   * Get extension settings with defaults - Enhanced with caching
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    const cacheKey = 'settings';
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    const defaults = {
      enabled: true,
      blockingLevel: 'strict',
      strictMode: true,
      blockImages: true,
      blockVideos: true,
      blockIframes: true,
      enableAiDetection: true,
      enableHeuristicScan: true,
      enableDnsBlocking: true,
      safeSearchEnabled: true,
      youtubeRestrictedMode: true,
      customDomains: [],
      customKeywords: [],
      whitelistedDomains: [],
      temporarilyWhitelisted: [],
      showBlockedPage: true,
      logBlocked: true,
      passwordProtected: false,
      password: '',
      homePage: 'https://www.google.com',
      blockStats: {
        totalBlocked: 0,
        blockedToday: 0,
        blockedThisWeek: 0,
        blockedThisMonth: 0,
        lastReset: Date.now(),
        lastMonthReset: Date.now()
      },
      statistics: {
        totalBlocked: 0,
        lastReset: Date.now()
      },
      userPreferences: {
        showNotifications: true,
        notifyOnBlock: false,
        autoCloseTab: false,
        redirectDelay: 0
      }
    };

    const stored = await this.getStorage(Object.keys(defaults));
    const settings = { ...defaults, ...stored };
    
    this._setCached(cacheKey, settings);
    return settings;
  },

  /**
   * Cache helper - get cached value
   * @private
   */
  _getCached(key) {
    const expiry = this._cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this._cache.delete(key);
      this._cacheExpiry.delete(key);
      return null;
    }
    return this._cache.get(key);
  },

  /**
   * Cache helper - set cached value
   * @private
   */
  _setCached(key, value) {
    this._cache.set(key, value);
    this._cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
  },

  /**
   * Clear all cached data
   */
  clearCache() {
    this._cache.clear();
    this._cacheExpiry.clear();
  },

  /**
   * Check if domain is temporarily whitelisted
   * @param {string} domain - Domain to check
   * @returns {Promise<boolean>} True if temporarily whitelisted
   */
  async isTemporarilyWhitelisted(domain) {
    const { temporarilyWhitelisted } = await this.getStorage('temporarilyWhitelisted');
    if (!Array.isArray(temporarilyWhitelisted)) return false;
    
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    return temporarilyWhitelisted.some(entry => 
      entry.domain === domain && (now - entry.timestamp) < thirtyMinutes
    );
  },

  /**
   * Add domain to temporary whitelist (30 minutes)
   * @param {string} domain - Domain to whitelist
   * @returns {Promise}
   */
  async addTemporarilyWhitelisted(domain) {
    const { temporarilyWhitelisted } = await this.getStorage('temporarilyWhitelisted');
    const list = Array.isArray(temporarilyWhitelisted) ? temporarilyWhitelisted : [];
    
    // Remove any existing entry for this domain
    const filtered = list.filter(e => e.domain !== domain);
    filtered.push({ domain, timestamp: Date.now() });
    
    await this.setStorage({ temporarilyWhitelisted: filtered });
    this.clearCache();
  },

  /**
   * Clean up expired temporary whitelists
   * @returns {Promise}
   */
  async cleanupTempWhitelist() {
    const { temporarilyWhitelisted } = await this.getStorage('temporarilyWhitelisted');
    if (!Array.isArray(temporarilyWhitelisted)) return;
    
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    const valid = temporarilyWhitelisted.filter(
      entry => (now - entry.timestamp) < thirtyMinutes
    );
    
    if (valid.length !== temporarilyWhitelisted.length) {
      await this.setStorage({ temporarilyWhitelisted: valid });
    }
  },

  /**
   * Validate domain format
   * @param {string} domain - Domain to validate
   * @returns {boolean} True if valid
   */
  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    
    // Remove protocol if present
    domain = domain.replace(/^(https?:\/\/)?/, '');
    
    // Remove path if present
    domain = domain.split('/')[0];
    
    // Check for valid domain pattern
    const pattern = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    return pattern.test(domain) && domain.length > 3;
  },

  /**
   * Sanitize domain - remove www, protocols, paths
   * @param {string} domain - Domain to sanitize
   * @returns {string} Sanitized domain
   */
  sanitizeDomain(domain) {
    if (!domain) return '';
    
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
  },

  /**
   * Check if URL is from trusted domain
   * @param {string} url - URL to check
   * @returns {boolean} True if trusted
   */
  isTrustedDomain(url) {
    const trustedDomains = [
      'github.com', 'google.com', 'microsoft.com', 'apple.com',
      'mozilla.org', 'wikipedia.org', 'edu', 'gov', 'ac.uk'
    ];
    
    try {
      const domain = this.extractDomain(url);
      return trustedDomains.some(td => 
        domain === td || domain.endsWith('.' + td) || domain.endsWith(td)
      );
    } catch {
      return false;
    }
  },

  /**
   * Calculate risk score for content
   * @param {string} content - Content to analyze
   * @returns {Object} Risk scores
   */
  calculateRiskScore(content) {
    const highRiskPatterns = [
      /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i,
      /porn/i, /xxx.*video/i, /sex.*cam/i, /live.*sex/i, /onlyfans/i
    ];
    
    const mediumRiskPatterns = [
      /adult/i, /sexy/i, /nude/i, /naked/i, /erotic/i, /cam.*girl/i,
      /escort/i, /hookup/i, /dating.*site/i
    ];
    
    let highRisk = 0;
    let mediumRisk = 0;
    
    const contentLower = content.toLowerCase();
    
    highRiskPatterns.forEach(pattern => {
      if (pattern.test(contentLower)) highRisk++;
    });
    
    mediumRiskPatterns.forEach(pattern => {
      if (pattern.test(contentLower)) mediumRisk++;
    });
    
    return { highRisk, mediumRisk, total: highRisk * 2 + mediumRisk };
  },

  /**
   * Debounce function execution
   * @param {Function} func - Function to debounce
   * @param {number} wait - Milliseconds to wait
   * @returns {Function} Debounced function
   */
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function execution
   * @param {Function} func - Function to throttle
   * @param {number} limit - Milliseconds limit
   * @returns {Function} Throttled function
   */
  throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Cloned object
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  },

  /**
   * Generate unique ID
   * @returns {string} Unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Format bytes to human readable
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} length - Max length
   * @returns {string} Truncated text
   */
  truncateText(text, length = 50) {
    if (!text || text.length <= length) return text;
    return text.substring(0, length).trim() + '...';
  },

  /**
   * Check if element is visible in viewport
   * @param {Element} element - Element to check
   * @returns {boolean} True if visible
   */
  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  /**
   * Batch process array with chunking
   * @param {Array} array - Array to process
   * @param {Function} callback - Callback for each item
   * @param {number} chunkSize - Items per chunk
   */
  async batchProcess(array, callback, chunkSize = 100) {
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize);
      await Promise.all(chunk.map(callback));
      
      // Yield to main thread
      if (i + chunkSize < array.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  },

  /**
   * Export data as JSON file
   * @param {Object} data - Data to export
   * @param {string} filename - Filename
   */
  exportAsJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Parse JSON safely
   * @param {string} json - JSON string
   * @param {*} defaultValue - Default value on error
   * @returns {*} Parsed value or default
   */
  safeJsonParse(json, defaultValue = null) {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Retry async operation with exponential backoff
   * @param {Function} operation - Async operation
   * @param {number} maxRetries - Max retries
   * @returns {Promise}
   */
  async retryWithBackoff(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  },

  /**
   * Get browser info
   * @returns {Object} Browser information
   */
  getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'unknown';
    let version = 'unknown';
    
    if (ua.includes('Firefox/')) {
      browser = 'Firefox';
      version = ua.match(/Firefox\/([0-9.]+)/)?.[1];
    } else if (ua.includes('Chrome/')) {
      browser = 'Chrome';
      version = ua.match(/Chrome\/([0-9.]+)/)?.[1];
    } else if (ua.includes('Safari/') && ua.includes('Version/')) {
      browser = 'Safari';
      version = ua.match(/Version\/([0-9.]+)/)?.[1];
    } else if (ua.includes('Edg/')) {
      browser = 'Edge';
      version = ua.match(/Edg\/([0-9.]+)/)?.[1];
    }
    
    return { browser, version, userAgent: ua };
  },

  /**
   * Check if dark mode is preferred
   * @returns {boolean} True if dark mode
   */
  isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  },

  /**
   * Format duration in milliseconds to readable string
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  },

  // Cache for frequently accessed data
  _cache: new Map(),
  _cacheExpiry: new Map(),
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  /**
   * Save settings
   * @param {Object} settings - Settings to save
   * @returns {Promise} Resolves when saved
   */
  async saveSettings(settings) {
    return this.setStorage(settings);
  },

  /**
   * Update specific setting
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise} Resolves when updated
   */
  async updateSetting(key, value) {
    return this.setStorage({ [key]: value });
  },

  // ============================================
  // Password/Security Utilities
  // ============================================

  /**
   * Hash password using SHA-256
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Verify password
   * @param {string} input - Input password
   * @param {string} stored - Stored hashed password
   * @returns {Promise<boolean>} True if passwords match
   */
  async verifyPassword(input, stored) {
    const hashed = await this.hashPassword(input);
    return hashed === stored;
  },

  // ============================================
  // Statistics Utilities
  // ============================================

  /**
   * Increment blocked count
   * @param {string} url - Blocked URL (optional)
   * @returns {Promise} Resolves when updated
   */
  async incrementBlockedCount(url = '') {
    const settings = await this.getSettings();
    const stats = this.normalizeBlockStats(settings.blockStats);

    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const weekInMs = 7 * dayInMs;

    const needsDayReset = now - stats.lastReset > dayInMs;
    const needsWeekReset = now - stats.lastReset > weekInMs;

    if (needsDayReset) stats.blockedToday = 0;
    if (needsWeekReset) stats.blockedThisWeek = 0;
    if (needsDayReset || needsWeekReset) stats.lastReset = now;

    stats.totalBlocked++;
    stats.blockedToday++;
    stats.blockedThisWeek++;
    
    if (settings.logBlocked && url) {
      const blockedHistory = await this.getStorage('blockedHistory');
      const history = blockedHistory.blockedHistory || [];
      
      history.unshift({
        url,
        domain: this.extractDomain(url),
        timestamp: Date.now()
      });
      
      // Keep only last 100 entries
      if (history.length > 100) {
        history.splice(100);
      }
      
      await this.setStorage({ blockedHistory: history });
    }
    
    return this.setStorage({ blockStats: stats, statistics: { totalBlocked: stats.totalBlocked, lastReset: stats.lastReset } });
  },

  /**
   * Get statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    const stored = await this.getStorage(['blockStats']);
    const stats = this.normalizeBlockStats(stored.blockStats);
    return stats;
  },

  /**
   * Reset statistics
   * @returns {Promise} Resolves when reset
   */
  async resetStatistics() {
    const reset = {
      totalBlocked: 0,
      blockedToday: 0,
      blockedThisWeek: 0,
      lastReset: Date.now()
    };
    await this.setStorage({ blockStats: reset, statistics: { totalBlocked: 0, lastReset: reset.lastReset }, blockedHistory: [] });
  },

  /**
   * Get blocked history
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} Array of blocked entries
   */
  async getBlockedHistory(limit = 50) {
    const result = await this.getStorage('blockedHistory');
    const history = result.blockedHistory || [];
    return history.slice(0, limit);
  },

  // ============================================
  // Filter List Management
  // ============================================

  /**
   * Load custom filter lists
   * @returns {Promise<Object>} Filter lists object
   */
  async loadFilterLists() {
    try {
      const domainsResponse = await fetch(chrome.runtime.getURL('filters/domains.json'));
      const keywordsResponse = await fetch(chrome.runtime.getURL('filters/keywords.json'));
      
      const domains = await domainsResponse.json();
      const keywords = await keywordsResponse.json();
      
      return { domains, keywords };
    } catch (e) {
      console.warn('Could not load filter lists:', e);
      return { domains: [], keywords: [] };
    }
  },

  /**
   * Add custom blocked domain
   * @param {string} domain - Domain to block
   * @returns {Promise} Resolves when added
   */
  async addCustomDomain(domain) {
    const settings = await this.getSettings();
    const customDomains = settings.customDomains || [];
    
    const cleanDomain = this.getRootDomain(domain);
    if (!customDomains.includes(cleanDomain)) {
      customDomains.push(cleanDomain);
      await this.updateSetting('customDomains', customDomains);
    }
  },

  /**
   * Remove custom blocked domain
   * @param {string} domain - Domain to unblock
   * @returns {Promise} Resolves when removed
   */
  async removeCustomDomain(domain) {
    const settings = await this.getSettings();
    const customDomains = settings.customDomains || [];
    
    const filtered = customDomains.filter(d => d !== domain);
    await this.updateSetting('customDomains', filtered);
  },

  /**
   * Add whitelisted domain
   * @param {string} domain - Domain to whitelist
   * @returns {Promise} Resolves when added
   */
  async addWhitelistedDomain(domain) {
    const settings = await this.getSettings();
    const whitelisted = settings.whitelistedDomains || [];
    
    const cleanDomain = this.getRootDomain(domain);
    if (!whitelisted.includes(cleanDomain)) {
      whitelisted.push(cleanDomain);
      await this.updateSetting('whitelistedDomains', whitelisted);
    }
  },

  /**
   * Check if domain is whitelisted
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if whitelisted
   */
  async isWhitelisted(url) {
    const settings = await this.getSettings();
    const whitelisted = settings.whitelistedDomains || [];
    const domain = this.getRootDomain(url);
    
    return whitelisted.some(w => domain.includes(w) || w.includes(domain));
  },

  // ============================================
  // Date and Time Utilities
  // ============================================

  /**
   * Format timestamp to readable date
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted date string
   */
  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  },

  /**
   * Get relative time (e.g., "5 minutes ago")
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Relative time string
   */
  getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  },

  // ============================================
  // Export/Import Utilities
  // ============================================

  /**
   * Export settings to JSON
   * @returns {Promise<string>} JSON string of settings
   */
  async exportSettings() {
    const settings = await this.getSettings();
    const history = await this.getBlockedHistory(1000);
    
    const exportData = {
      version: '1.0',
      exportDate: Date.now(),
      settings,
      blockedHistory: history
    };
    
    return JSON.stringify(exportData, null, 2);
  },

  /**
   * Import settings from JSON
   * @param {string} jsonString - JSON string to import
   * @returns {Promise<boolean>} True if successful
   */
  async importSettings(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
      
      if (data.blockedHistory) {
        await this.setStorage({ blockedHistory: data.blockedHistory });
      }
      
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  // ============================================
  // Notification Utilities
  // ============================================

  /**
   * Show browser notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  showNotification(title, message) {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title,
        message
      });
    }
  },

  // ============================================
  // Logging Utilities
  // ============================================

  /**
   * Log message with timestamp
   * @param {string} message - Message to log
   * @param {string} level - Log level (info, warn, error)
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[Content Shield ${timestamp}]`;
    
    switch (level) {
      case 'warn':
        console.warn(prefix, message);
        break;
      case 'error':
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  },

  // ============================================
  // Internal Helpers
  // ============================================

  /**
   * Ensure blockStats object has all required fields
   * @param {Object} stats - Stats to normalize
   * @returns {Object} Normalized stats
   */
  normalizeBlockStats(stats) {
    const now = Date.now();
    const base = {
      totalBlocked: 0,
      blockedToday: 0,
      blockedThisWeek: 0,
      lastReset: now
    };
    const merged = { ...base, ...(stats || {}) };
    return merged;
  },

  /**
   * Ensure lastReset is a valid timestamp
   * @param {number} lastReset - Previous last reset timestamp
   * @returns {number} Valid timestamp
   */
  ensureLastReset(lastReset) {
    return typeof lastReset === 'number' && !Number.isNaN(lastReset) ? lastReset : Date.now();
  }
};

// Make Utils available globally if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}