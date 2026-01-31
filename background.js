// Background service worker for Content Shield extension

'use strict';

// Import browser polyfill for cross-browser compatibility
// Note: This should be loaded first in manifest.json
const chromeAPI = typeof browser !== 'undefined' ? browser : chrome;

const DYNAMIC_RULE_START = 1000;
const GITHUB_SEARCH_BASE = 'https://api.github.com/search/code';
const GITHUB_CATEGORIES = ['porn', 'adult', 'malware'];

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  strictMode: false,
  blockingLevel: 'strict',
  blockImages: true,
  blockVideos: true,
  customDomains: [],
  customKeywords: [],
  whitelistedDomains: [],
  passwordProtected: false,
  password: '',
  homePage: 'https://www.google.com',
  blockStats: {
    totalBlocked: 0,
    blockedToday: 0,
    blockedThisWeek: 0,
    lastReset: Date.now()
  },
  blockHistory: [],
  reportedSites: []
};

// Legacy default list kept empty to rely solely on filters/domains.json
const DEFAULT_BLOCKED_DOMAINS = [];

// Utility: flatten category-based filter files
function flattenCategories(categories = {}) {
  return Object.values(categories).flat().filter(Boolean);
}

// Utility: ensure unique, lowercase list
function uniqueList(list = []) {
  const normalized = list
    .filter(Boolean)
    .map(item => item.toString().trim().toLowerCase())
    .filter(item => item.length > 0);
  return Array.from(new Set(normalized));
}

// Load bundled filter lists (domains & keywords)
async function loadDefaultFilters() {
  try {
    const domainsResponse = await fetch(chromeAPI.runtime.getURL('filters/domains.json'));
    const keywordsResponse = await fetch(chromeAPI.runtime.getURL('filters/keywords.json'));

    const domainsJson = await domainsResponse.json();
    const keywordsJson = await keywordsResponse.json();

    const domains = flattenCategories(domainsJson.categories);
    const keywords = flattenCategories(keywordsJson.categories);

    return { domains, keywords };
  } catch (error) {
    console.warn('Could not load default filters:', error);
    return { domains: [], keywords: [] };
  }
}

// Ensure stored filters include the bundled lists; returns merged values
async function ensureFiltersSeeded() {
  const { domains: defaultDomains, keywords: defaultKeywords } = await loadDefaultFilters();
  const current = await chromeAPI.storage.local.get([
    'enabled',
    'customDomains',
    'customKeywords',
    'whitelistedDomains'
  ]);

  const mergedDomains = uniqueList([...(current.customDomains || []), ...defaultDomains]);
  const mergedKeywords = uniqueList([...(current.customKeywords || []), ...defaultKeywords]);

  const whitelist = uniqueList(current.whitelistedDomains || []);

  await chromeAPI.storage.local.set({
    customDomains: mergedDomains,
    customKeywords: mergedKeywords,
    whitelistedDomains: whitelist
  });

  return {
    enabled: typeof current.enabled === 'boolean' ? current.enabled : DEFAULT_SETTINGS.enabled,
    customDomains: mergedDomains,
    customKeywords: mergedKeywords,
    whitelistedDomains: whitelist
  };
}

// Classify a URL/domain into a coarse category for logging
function classifyCategory(urlOrDomain) {
  const value = (urlOrDomain || '').toLowerCase();
  if (!value) return 'unknown';
  if (value.includes('porn') || value.includes('sex') || value.includes('xxx') || value.includes('adult')) return 'adult';
  if (value.includes('malware') || value.includes('virus') || value.includes('phishing')) return 'malware';
  if (value.includes('gamble') || value.includes('casino') || value.includes('bet')) return 'gambling';
  return 'unknown';
}

// Persist AI/logged findings (keeps last 500)
async function saveFinding(entry) {
  const existing = await chromeAPI.storage.local.get(['aiFindings']);
  const list = Array.isArray(existing.aiFindings) ? existing.aiFindings : [];
  list.unshift({ ...entry, timestamp: Date.now() });
  if (list.length > 500) list.splice(500);
  await chromeAPI.storage.local.set({ aiFindings: list });
}

// Fetch GitHub links for lists using the public API (rate-limited)
async function fetchGitHubSources() {
  try {
    const results = {};
    for (const category of GITHUB_CATEGORIES) {
      const query = encodeURIComponent(`${category} domains list`);
      const url = `${GITHUB_SEARCH_BASE}?q=${query}&per_page=5`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
      if (!resp.ok) continue;
      const data = await resp.json();
      results[category] = (data.items || []).map(item => item.html_url).filter(Boolean);
    }
    await chromeAPI.storage.local.set({ githubSources: results });
    await saveFinding({ source: 'github', category: 'lookup', url: 'github_search', details: results });
    console.log('GitHub sources refreshed');
  } catch (error) {
    console.warn('GitHub source fetch failed:', error);
  }
}

// Initialize extension on install
chromeAPI.runtime.onInstalled.addListener(async (details) => {
  console.log('Content Shield installed:', details.reason);

  if (details.reason === 'install') {
    await initializeSettings();
    chromeAPI.tabs.create({ url: chromeAPI.runtime.getURL('options.html') });
  } else if (details.reason === 'update') {
    await updateSettings();
  }

  await updateBlockingRules();
});

// Refresh rules on browser startup to ensure consistency
chromeAPI.runtime.onStartup.addListener(async () => {
  await updateBlockingRules();
});

// Initialize default settings
async function initializeSettings() {
  try {
    const { domains, keywords } = await loadDefaultFilters();
    const mergedDomains = uniqueList(domains);
    const mergedKeywords = uniqueList(keywords);

    const settings = { 
      ...DEFAULT_SETTINGS,
      customDomains: mergedDomains,
      customKeywords: mergedKeywords
    };
    
    await chromeAPI.storage.local.set(settings);
    console.log('Settings initialized');
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
}

// Update settings on extension update
async function updateSettings() {
  try {
    const currentSettings = await chromeAPI.storage.local.get(null);
    const { domains, keywords } = await loadDefaultFilters();
    const mergedSettings = { ...DEFAULT_SETTINGS, ...currentSettings };

    mergedSettings.customDomains = uniqueList([
      ...(currentSettings.customDomains || []),
      ...domains
    ]);

    mergedSettings.customKeywords = uniqueList([
      ...(currentSettings.customKeywords || []),
      ...keywords
    ]);

    await chromeAPI.storage.local.set(mergedSettings);
    console.log('Settings updated');
  } catch (error) {
    console.error('Error updating settings:', error);
  }
}

// Update declarative net request rules
async function updateBlockingRules() {
  try {
    const merged = await ensureFiltersSeeded();
    const { enabled, customDomains, whitelistedDomains } = merged;

    if (!enabled) {
      // Remove all rules if disabled
      if (chromeAPI.declarativeNetRequest && chromeAPI.declarativeNetRequest.updateDynamicRules) {
        await chromeAPI.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: Array.from({ length: 5000 }, (_, i) => DYNAMIC_RULE_START + i)
        });
      }
      return;
    }

    const domains = uniqueList(customDomains || []);
    const whitelist = uniqueList(whitelistedDomains || []);

    // Filter out whitelisted domains
    const domainsToBlock = domains.filter(domain => !whitelist.includes(domain));

    // Create blocking rules
    if (!chromeAPI.declarativeNetRequest || !chromeAPI.declarativeNetRequest.updateDynamicRules) {
      console.warn('Declarative Net Request not available. Falling back to navigation-based blocking.');
      return;
    }

    const rules = domainsToBlock.map((domain, index) => ({
      id: DYNAMIC_RULE_START + index,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          url: chromeAPI.runtime.getURL('blocked.html') + '?url=' + encodeURIComponent('https://' + domain) + '&reason=blocked_domain'
        }
      },
      condition: {
        urlFilter: `*://*.${domain}/*`,
        resourceTypes: ['main_frame']
      }
    }));

    // Update dynamic rules
    await chromeAPI.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: Array.from({ length: 5000 }, (_, i) => DYNAMIC_RULE_START + i),
      addRules: rules.slice(0, 5000) // Chrome has a limit on dynamic rules
    });

    console.log(`Updated blocking rules: ${rules.length} domains`);
  } catch (error) {
    console.error('Error updating blocking rules:', error);
  }
}

// Listen for storage changes
chromeAPI.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local') {
    // Check if blocking-related settings changed
    if (changes.enabled || changes.customDomains || changes.whitelistedDomains) {
      await updateBlockingRules();
    }
  }
});

// Listen for navigation events
chromeAPI.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    // Main frame navigation
    checkURL(details.url, details.tabId);
  }
});

// Check if URL should be blocked
async function checkURL(url, tabId) {
  try {
    const merged = await ensureFiltersSeeded();
    const { enabled, customDomains, whitelistedDomains, customKeywords } = merged;

    if (!enabled) return;

    if (url.startsWith(chromeAPI.runtime.getURL('blocked.html'))) {
      return;
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    const whitelist = whitelistedDomains || [];
    const domains = customDomains || [];
    const keywords = customKeywords || [];

    // Check if whitelisted
    if (whitelist.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
      return;
    }

    // Check custom domains
    const isBlocked = domains.some(domain => {
      const domainLower = domain.toLowerCase();
      return hostname === domainLower || hostname.endsWith('.' + domainLower);
    });

    if (isBlocked) {
      // If DNR is available, it will handle the redirect. Otherwise, block manually.
      if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) {
        blockURL(url, tabId, 'blocked_domain');
      }
      return;
    }

    // Check URL for keywords
    const urlLower = url.toLowerCase();
    for (const keyword of keywords) {
      if (urlLower.includes(keyword.toLowerCase())) {
        blockURL(url, tabId, 'keyword');
        return;
      }
    }

  } catch (error) {
    console.error('Error checking URL:', error);
  }
}

// Block URL by redirecting to blocked page
function blockURL(url, tabId, reason) {
  const blockedURL = chromeAPI.runtime.getURL('blocked.html') + 
    '?url=' + encodeURIComponent(url) + 
    '&reason=' + encodeURIComponent(reason);
  
  chromeAPI.tabs.update(tabId, { url: blockedURL });
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'logBlock') {
    logBlock(message.data);
    sendResponse({ status: 'logged' });
  } else if (message.action === 'getStats') {
    getStats().then(stats => sendResponse(stats));
    return true;
  } else if (message.action === 'resetStats') {
    resetStats().then(() => sendResponse({ status: 'reset' }));
    return true;
  } else if (message.action === 'checkCurrentTab') {
    checkCurrentTab().then(result => sendResponse(result));
    return true;
  } else if (message.action === 'updateRules') {
    updateBlockingRules().then(() => sendResponse({ status: 'updated' }));
    return true;
  } else if (message.action === 'toggleProtection') {
    chrome.storage.local.set({ enabled: message.enabled }).then(async () => {
      await updateBlockingRules();
      const stats = await getStats();
      updateBadge(message.enabled ? stats.blockedToday : 0);
      sendResponse({ status: 'toggled', enabled: message.enabled });
    }).catch(() => sendResponse({ status: 'error' }));
    return true;
  } else if (message.action === 'whitelistUpdated' || message.action === 'settingsUpdated') {
    updateBlockingRules().then(() => sendResponse({ status: 'updated' }));
    return true;
  } else if (message.action === 'fetchGitHubSources') {
    fetchGitHubSources().then(() => sendResponse({ status: 'fetched' }));
    return true;
  }
});

// Log blocked content
async function logBlock(data) {
  try {
    const { blockStats, blockHistory } = await chrome.storage.local.get([
      'blockStats',
      'blockHistory'
    ]);

    const stats = { ...(blockStats || DEFAULT_SETTINGS.blockStats) };
    const history = Array.isArray(blockHistory) ? [...blockHistory] : [];

    // Check if we need to reset daily/weekly counters
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const weekInMs = 7 * dayInMs;

    const needsDayReset = now - stats.lastReset > dayInMs;
    const needsWeekReset = now - stats.lastReset > weekInMs;

    if (needsDayReset) {
      stats.blockedToday = 0;
    }

    if (needsWeekReset) {
      stats.blockedThisWeek = 0;
    }

    if (needsDayReset || needsWeekReset) {
      stats.lastReset = now;
    }

    // Increment counters
    stats.totalBlocked++;
    stats.blockedToday++;
    stats.blockedThisWeek++;

    // AI-style classification for reporting
    if (data && data.url) {
      const category = classifyCategory(data.url);
      await saveFinding({
        source: 'block_event',
        category,
        url: data.url,
        reason: data.reason || data.details || data.type || 'blocked'
      });
    }

    // Add to history (keep last 100)
    history.unshift({
      ...data,
      timestamp: now
    });

    if (history.length > 100) {
      history.splice(100);
    }

    await chrome.storage.local.set({
      blockStats: stats,
      blockHistory: history
    });

    // Update badge
    updateBadge(stats.blockedToday);

  } catch (error) {
    console.error('Error logging block:', error);
  }
}

// Get statistics
async function getStats() {
  try {
    const { blockStats } = await chrome.storage.local.get('blockStats');
    return { ...(blockStats || DEFAULT_SETTINGS.blockStats) };
  } catch (error) {
    console.error('Error getting stats:', error);
    return DEFAULT_SETTINGS.blockStats;
  }
}

// Reset statistics
async function resetStats() {
  try {
    const newStats = {
      totalBlocked: 0,
      blockedToday: 0,
      blockedThisWeek: 0,
      lastReset: Date.now()
    };

    await chrome.storage.local.set({
      blockStats: newStats,
      blockHistory: []
    });

    updateBadge(0);
  } catch (error) {
    console.error('Error resetting stats:', error);
  }
}

// Update extension badge
function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#dc3545' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Check current tab
async function checkCurrentTab() {
  try {
    const [tab] = await chromeAPI.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      return { error: 'No active tab' };
    }

    const url = tab.url;
    
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return { 
        url: url,
        canBlock: false,
        message: 'Cannot filter system pages'
      };
    }

    const merged = await ensureFiltersSeeded();
    const { enabled, customDomains, whitelistedDomains } = merged;

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

  const whitelist = whitelistedDomains || [];
  const domains = customDomains || [];

  const isWhitelisted = whitelist.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

  const isBlocked = domains.some(domain => {
      const domainLower = domain.toLowerCase();
      return hostname.toLowerCase() === domainLower || hostname.toLowerCase().endsWith('.' + domainLower);
    });

    return {
      url: url,
      hostname: hostname,
      canBlock: true,
      enabled: enabled,
      isWhitelisted: isWhitelisted,
      isBlocked: isBlocked
    };

  } catch (error) {
    console.error('Error checking current tab:', error);
    return { error: error.message };
  }
}

// Set up alarms for daily reset
chrome.alarms.create('dailyReset', {
  periodInMinutes: 1440 // 24 hours
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    resetDailyStats();
  } else if (alarm.name === 'githubSync') {
    fetchGitHubSources();
  }
});

// Periodic GitHub sync for new list sources (every 12 hours)
chrome.alarms.create('githubSync', {
  periodInMinutes: 720
});

// Reset daily statistics
async function resetDailyStats() {
  try {
    const { blockStats } = await chrome.storage.local.get('blockStats');
    
    if (blockStats) {
      blockStats.blockedToday = 0;
      blockStats.lastReset = Date.now();
      await chrome.storage.local.set({ blockStats });
      updateBadge(0);
    }
  } catch (error) {
    console.error('Error resetting daily stats:', error);
  }
}

// Context menu for quick actions (right-click menu)
if (chrome.contextMenus && chrome.contextMenus.create && chrome.contextMenus.onClicked) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'blockDomain',
      title: 'Block this domain',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'whitelistDomain',
      title: 'Whitelist this domain',
      contexts: ['page']
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.url) return;

    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;

      if (info.menuItemId === 'blockDomain') {
        const { customDomains } = await chrome.storage.local.get('customDomains');
        const domains = customDomains || [];
        
        if (!domains.includes(hostname)) {
          domains.push(hostname);
          await chrome.storage.local.set({ customDomains: domains });
          
          // Reload the tab to apply block
          chrome.tabs.reload(tab.id);
        }
      } else if (info.menuItemId === 'whitelistDomain') {
        const { whitelistedDomains } = await chrome.storage.local.get('whitelistedDomains');
        const whitelist = whitelistedDomains || [];
        
        if (!whitelist.includes(hostname)) {
          whitelist.push(hostname);
          await chrome.storage.local.set({ whitelistedDomains: whitelist });
          
          // Reload the tab
          chrome.tabs.reload(tab.id);
        }
      }
    } catch (error) {
      console.error('Context menu error:', error);
    }
  });
} else {
  console.warn('Context menus API not available in this environment.');
}

// Initialize badge on startup
chrome.runtime.onStartup.addListener(async () => {
  const stats = await getStats();
  updateBadge(stats.blockedToday);
});

console.log('Content Shield background service worker initialized');