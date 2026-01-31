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
   * Get extension settings with defaults
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    const defaults = {
      enabled: true,
      blockingLevel: 'strict', // strict, moderate, mild
      customDomains: [],
      customKeywords: [],
      whitelistedDomains: [],
      showBlockedPage: true,
      logBlocked: true,
      passwordProtected: false,
      password: '',
      blockStats: {
        totalBlocked: 0,
        blockedToday: 0,
        blockedThisWeek: 0,
        lastReset: Date.now()
      },
      statistics: {
        totalBlocked: 0,
        lastReset: Date.now()
      }
    };

    const stored = await this.getStorage(Object.keys(defaults));
    return { ...defaults, ...stored };
  },

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