// Background service worker for Content Shield extension - Enhanced Version
// Advanced porn/adult content blocker with AI-style detection

'use strict';

// Import browser polyfill for cross-browser compatibility
const chromeAPI = typeof browser !== 'undefined' ? browser : chrome;

// Constants
const DYNAMIC_RULE_START = 1000;
const MAX_DYNAMIC_RULES = 5000;
const GITHUB_SEARCH_BASE = 'https://api.github.com/search/code';
const GITHUB_CATEGORIES = ['porn', 'adult', 'malware', 'gambling', 'phishing'];
const TRUSTED_DOMAINS = ['github.com', 'google.com', 'microsoft.com', 'apple.com', 'mozilla.org'];

// AI-Style Pattern Detection
const AI_PATTERNS = {
  adultDomains: [
    /porn/i, /xxx/i, /sex/i, /adult/i, /nude/i, /naked/i, /erotic/i,
    /cam/i, /escort/i, /hookup/i, /dating.*sex/i, /sexcam/i,
    /live.*sex/i, /webcam.*sex/i, /stripper/i, /stripchat/i,
    /onlyfans/i, /fansly/i, /manyvids/i, /clips4sale/i,
    /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i,
    /tube8/i, /spankbang/i, /chaturbate/i, /myfreecams/i,
    /bongacams/i, /livejasmin/i, /streamate/i, /camsoda/i,
    /brazzers/i, /bangbros/i, /realitykings/i, /naughtyamerica/i,
    /digitalplayground/i, /evilangel/i, /julesjordan/i,
    /hentai/i, /rule34/i, /gelbooru/i, /danbooru/i, /e621/i,
    /fakku/i, /irodoricomics/i, /hentai.*manga/i, /doujin/i,
    /gay.*porn/i, /lesbian.*porn/i, /shemale/i, /trans.*porn/i,
    /bbw/i, /milf/i, /teen.*porn/i, /amateur.*porn/i, /homemade.*porn/i
  ],
  suspiciousPaths: [
    /\/porn/i, /\/xxx/i, /\/sex/i, /\/adult/i, /\/nude/i,
    /\/naked/i, /\/erotic/i, /\/cam/i, /\/escort/i, /\/hookup/i,
    /\/videos\/porn/i, /\/videos\/xxx/i, /\/videos\/sex/i,
    /\/gallery\/nude/i, /\/gallery\/sex/i, /\/pics\/adult/i,
    /\/content\/porn/i, /\/media\/xxx/i, /\/stream\/sex/i,
    /\/live\/cam/i, /\/private\/show/i, /\/vip\/content/i,
    /\/members\/area/i, /\/premium\/access/i, /\/exclusive\/content/i
  ],
  queryParams: [
    /[?&]porn=/i, /[?&]sex=/i, /[?&]xxx=/i, /[?&]adult=/i,
    /[?&]nude=/i, /[?&]naked=/i, /[?&]erotic=/i, /[?&]cam=/i,
    /[?&]video=porn/i, /[?&]category=sex/i, /[?&]tag=xxx/i,
    /[?&]search=adult/i, /[?&]query=nude/i, /[?&]filter=erotic/i
  ]
};

// Default settings - Enhanced
const DEFAULT_SETTINGS = {
  enabled: true,
  strictMode: true,
  blockingLevel: 'strict', // strict, moderate, mild
  blockImages: true,
  blockVideos: true,
  blockIframes: true,
  enableAiDetection: true,
  enableHeuristicScan: true,
  enableDnsBlocking: true,
  customDomains: [],
  customKeywords: [],
  whitelistedDomains: [],
  temporarilyWhitelisted: [], // 30-minute temporary whitelist
  passwordProtected: false,
  password: '',
  homePage: 'https://www.google.com',
  safeSearchEnabled: true,
  youtubeRestrictedMode: true,
  blockStats: {
    totalBlocked: 0,
    blockedToday: 0,
    blockedThisWeek: 0,
    blockedThisMonth: 0,
    lastReset: Date.now(),
    lastMonthReset: Date.now()
  },
  blockHistory: [],
  reportedSites: [],
  aiFindings: [],
  suspiciousPatterns: [],
  userPreferences: {
    showNotifications: true,
    notifyOnBlock: false,
    autoCloseTab: false,
    redirectDelay: 0
  }
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

// Enhanced category classification with AI-style scoring
function classifyCategory(urlOrDomain, context = {}) {
  const value = (urlOrDomain || '').toLowerCase();
  if (!value) return { category: 'unknown', confidence: 0, flags: [] };

  const flags = [];
  let adultScore = 0;
  let malwareScore = 0;
  let gamblingScore = 0;

  // Check against AI patterns
  for (const pattern of AI_PATTERNS.adultDomains) {
    if (pattern.test(value)) {
      adultScore += 25;
      flags.push(`pattern:${pattern.source}`);
    }
  }

  for (const pattern of AI_PATTERNS.suspiciousPaths) {
    if (pattern.test(value)) {
      adultScore += 15;
      flags.push(`path_pattern`);
    }
  }

  for (const pattern of AI_PATTERNS.queryParams) {
    if (pattern.test(value)) {
      adultScore += 10;
      flags.push(`query_pattern`);
    }
  }

  // Check for malware indicators
  if (value.includes('malware') || value.includes('virus') || value.includes('phishing') || 
      value.includes('trojan') || value.includes('ransomware')) {
    malwareScore += 50;
    flags.push('malware_keyword');
  }

  // Check for gambling indicators
  if (value.includes('gamble') || value.includes('casino') || value.includes('bet') || 
      value.includes('poker') || value.includes('slots') || value.includes('lottery')) {
    gamblingScore += 50;
    flags.push('gambling_keyword');
  }

  // Determine primary category
  let category = 'unknown';
  let confidence = 0;

  if (adultScore >= malwareScore && adultScore >= gamblingScore && adultScore > 0) {
    category = 'adult';
    confidence = Math.min(adultScore, 100);
  } else if (malwareScore >= adultScore && malwareScore >= gamblingScore && malwareScore > 0) {
    category = 'malware';
    confidence = Math.min(malwareScore, 100);
  } else if (gamblingScore > 0) {
    category = 'gambling';
    confidence = Math.min(gamblingScore, 100);
  }

  return { category, confidence, flags, scores: { adult: adultScore, malware: malwareScore, gambling: gamblingScore } };
}

// Persist AI/logged findings with enhanced analytics
async function saveFinding(entry) {
  const existing = await chromeAPI.storage.local.get(['aiFindings', 'suspiciousPatterns']);
  const list = Array.isArray(existing.aiFindings) ? existing.aiFindings : [];
  const patterns = Array.isArray(existing.suspiciousPatterns) ? existing.suspiciousPatterns : [];

  // Add finding
  const enrichedEntry = {
    ...entry,
    timestamp: Date.now(),
    id: generateId(),
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  list.unshift(enrichedEntry);
  if (list.length > 500) list.splice(500);

  // Track suspicious patterns
  if (entry.flags && entry.flags.length > 0) {
    for (const flag of entry.flags) {
      const existingPattern = patterns.find(p => p.name === flag);
      if (existingPattern) {
        existingPattern.count++;
        existingPattern.lastSeen = Date.now();
      } else {
        patterns.push({
          name: flag,
          count: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now()
        });
      }
    }
  }

  await chromeAPI.storage.local.set({ 
    aiFindings: list,
    suspiciousPatterns: patterns
  });
}

// Generate unique ID for entries
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
    const { domains: defaultDomains, keywords: defaultKeywords } = await loadDefaultFilters();
    const mergedDomains = uniqueList(defaultDomains);
    const mergedKeywords = uniqueList(defaultKeywords);

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
    const { domains: defaultDomains, keywords: defaultKeywords } = await loadDefaultFilters();
    const mergedSettings = { ...DEFAULT_SETTINGS, ...currentSettings };

    mergedSettings.customDomains = uniqueList([
      ...(currentSettings.customDomains || []),
      ...defaultDomains
    ]);

    mergedSettings.customKeywords = uniqueList([
      ...(currentSettings.customKeywords || []),
      ...defaultKeywords
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

// Enhanced URL checking with AI-style detection
async function checkURL(url, tabId) {
  try {
    const merged = await ensureFiltersSeeded();
    const settings = await chromeAPI.storage.local.get(['enabled', 'enableAiDetection', 'enableHeuristicScan', 'temporarilyWhitelisted']);
    const { enabled, customDomains, whitelistedDomains, customKeywords } = merged;

    if (!enabled) return;

    // Skip internal extension pages
    if (url.startsWith(chromeAPI.runtime.getURL('')) || 
        url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:') ||
        url.startsWith('moz-extension://')) {
      return;
    }

    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    const urlLower = url.toLowerCase();
    const searchParams = urlObj.search.toLowerCase();

    // Never block trusted domains
    if (TRUSTED_DOMAINS.some(td => hostname === td || hostname.endsWith('.' + td))) {
      return;
    }

    // Never block the Content Shield GitHub repository
    if (hostname === 'github.com' && pathname.includes('/devs-s/contentshield-extension')) {
      return;
    }

    const whitelist = whitelistedDomains || [];
    const domains = customDomains || [];
    const keywords = customKeywords || [];
    const tempWhitelist = settings.temporarilyWhitelisted || [];

    // Check if temporarily whitelisted (30-minute window)
    const now = Date.now();
    const validTempWhitelist = tempWhitelist.filter(entry => now - entry.timestamp < 30 * 60 * 1000);
    if (validTempWhitelist.some(entry => hostname.includes(entry.domain))) {
      return;
    }

    // Check if permanently whitelisted
    if (whitelist.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
      return;
    }

    // AI-Style Pattern Detection
    if (settings.enableAiDetection !== false) {
      const classification = classifyCategory(url);
      
      if (classification.category === 'adult' && classification.confidence >= 30) {
        await saveFinding({
          source: 'ai_detection',
          category: 'adult',
          url: url,
          confidence: classification.confidence,
          flags: classification.flags,
          scores: classification.scores
        });
        
        if (classification.confidence >= 50) {
          blockURL(url, tabId, `ai_detected_adult_${classification.confidence}%`);
          return;
        }
      }
    }

    // Heuristic scan for suspicious patterns
    if (settings.enableHeuristicScan !== false) {
      const heuristicScore = performHeuristicScan(hostname, pathname, searchParams);
      if (heuristicScore.score >= 70) {
        await saveFinding({
          source: 'heuristic_scan',
          category: 'adult',
          url: url,
          confidence: heuristicScore.score,
          flags: heuristicScore.flags
        });
        blockURL(url, tabId, `heuristic_adult_${heuristicScore.score}%`);
        return;
      }
    }

    // Always block URLs containing explicit adult terms
    const explicitTerms = ['porn', 'porno', 'pornography', 'xxx', 'sex', 'adult content', 
                          'nude pics', 'naked girls', 'erotic videos', 'cam sex'];
    for (const term of explicitTerms) {
      if (urlLower.includes(term)) {
        blockURL(url, tabId, `explicit_term_${term}`);
        return;
      }
    }

    // Check custom domains
    const isBlocked = domains.some(domain => {
      const domainLower = domain.toLowerCase();
      return hostname === domainLower || hostname.endsWith('.' + domainLower);
    });

    if (isBlocked) {
      blockURL(url, tabId, 'blocked_domain_list');
      return;
    }

    // Check URL for keywords
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      if (urlLower.includes(keywordLower) || pathname.includes(keywordLower)) {
        blockURL(url, tabId, `keyword_${keyword}`);
        return;
      }
    }

    // Check for SafeSearch enforcement
    await enforceSafeSearch(url, tabId);

  } catch (error) {
    console.error('Error checking URL:', error);
  }
}

// Heuristic scanning for suspicious patterns
function performHeuristicScan(hostname, pathname, searchParams) {
  let score = 0;
  const flags = [];
  
  // Check for numeric subdomains (common in adult sites)
  if (/^\d+\.\w+\./.test(hostname)) {
    score += 10;
    flags.push('numeric_subdomain');
  }
  
  // Check for suspicious TLDs
  const suspiciousTLDs = ['.xxx', '.sex', '.adult', '.porn'];
  if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
    score += 50;
    flags.push('suspicious_tld');
  }
  
  // Check for video/image galleries in path
  if (/(gallery|pics|videos|photos|images)\/(adult|sex|xxx|porn|nude|naked)/i.test(pathname)) {
    score += 30;
    flags.push('suspicious_gallery_path');
  }
  
  // Check for age verification redirects
  if (/age.?verify|enter.?site|adult.?only|18.?only/i.test(pathname + searchParams)) {
    score += 40;
    flags.push('age_verification_gate');
  }
  
  // Check for common adult site structures
  if (/\/(videos|movies|clips)\/\d+/.test(pathname)) {
    score += 15;
    flags.push('numbered_content_structure');
  }
  
  // Check for excessive subdomains (often used by adult sites)
  const subdomainCount = hostname.split('.').length - 2;
  if (subdomainCount > 3) {
    score += 10;
    flags.push('excessive_subdomains');
  }
  
  return { score: Math.min(score, 100), flags };
}

// Enforce SafeSearch on search engines
async function enforceSafeSearch(url, tabId) {
  const settings = await chromeAPI.storage.local.get(['safeSearchEnabled']);
  if (!settings.safeSearchEnabled) return;
  
  const urlObj = new URL(url);
  const hostname = urlObj.hostname.toLowerCase();
  
  // Google SafeSearch
  if (hostname.includes('google.')) {
    if (!urlObj.searchParams.has('safe', 'active')) {
      urlObj.searchParams.set('safe', 'active');
      chromeAPI.tabs.update(tabId, { url: urlObj.toString() });
    }
  }
  
  // Bing SafeSearch
  if (hostname.includes('bing.')) {
    if (!urlObj.searchParams.has('adlt', 'strict')) {
      urlObj.searchParams.set('adlt', 'strict');
      chromeAPI.tabs.update(tabId, { url: urlObj.toString() });
    }
  }
  
  // DuckDuckGo SafeSearch
  if (hostname.includes('duckduckgo.')) {
    if (!urlObj.searchParams.has('kp', '1')) {
      urlObj.searchParams.set('kp', '1');
      chromeAPI.tabs.update(tabId, { url: urlObj.toString() });
    }
  }
  
  // Yahoo SafeSearch
  if (hostname.includes('yahoo.')) {
    if (!urlObj.searchParams.has('vm', 'r')) {
      urlObj.searchParams.set('vm', 'r');
      chromeAPI.tabs.update(tabId, { url: urlObj.toString() });
    }
  }
}

// Block URL by redirecting to blocked page
function blockURL(url, tabId, reason) {
  const blockedURL = chromeAPI.runtime.getURL('blocked.html') + 
    '?url=' + encodeURIComponent(url) + 
  
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
  } else if (message.action === 'updateFilters') {
    handleFilterUpdate(message.data).then(() => {
      sendResponse({ status: 'filters_updated' });
    }).catch(error => {
      console.error('Filter update error:', error);
      sendResponse({ status: 'error', error: error.message });
    });
    return true;
  }
});

// Handle filter updates from blocked page
function handleFilterUpdate(data) {
  return new Promise((resolve, reject) => {
    if (data.type === 'remove_false_positive') {
      // Remove domain from filters
      removeDomainFromFilters(data.domain).then(resolve).catch(reject);
    } else {
      reject('Unknown filter update type');
    }
  });
}

// Remove domain from filters
async function removeDomainFromFilters(domainToRemove) {
  try {
    // Load current filters from extension storage
    const result = await chromeAPI.storage.local.get(['customDomains', 'filterData']);
    let customDomains = result.customDomains || [];
    let filterData = result.filterData || {};
    
    // Remove domain from custom domains list
    customDomains = customDomains.filter(domain => domain !== domainToRemove);
    
    // Also update filter data structure if it exists
    if (filterData.categories && filterData.categories.adult) {
      filterData.categories.adult = filterData.categories.adult.filter(domain => domain !== domainToRemove);
      filterData.totalDomains = filterData.categories.adult.length;
      filterData.lastUpdated = new Date().toISOString().split('T')[0];
    }
    
    // Save updated data back to storage
    await chromeAPI.storage.local.set({
      customDomains: customDomains,
      filterData: filterData
    });
    
    // Update blocking rules to apply changes immediately
    await updateBlockingRules();
    
    console.log('Successfully removed domain from filters:', domainToRemove);
    return true;
  } catch (error) {
    console.error('Error removing domain from filters:', error);
    throw error;
  }
}

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

// Enhanced context menu for quick actions
if (chrome.contextMenus && chrome.contextMenus.create && chrome.contextMenus.onClicked) {
  chrome.runtime.onInstalled.addListener(() => {
    // Remove existing menus
    chrome.contextMenus.removeAll();
    
    // Create parent menu
    chrome.contextMenus.create({
      id: 'contentShield',
      title: 'Content Shield',
      contexts: ['page']
    });
    
    // Block domain
    chrome.contextMenus.create({
      id: 'blockDomain',
      parentId: 'contentShield',
      title: 'Block this domain permanently',
      contexts: ['page'],
      icons: { '16': 'imgs/icon16.png' }
    });
    
    // Whitelist domain
    chrome.contextMenus.create({
      id: 'whitelistDomain',
      parentId: 'contentShield',
      title: 'Whitelist this domain permanently',
      contexts: ['page']
    });
    
    // Temporary whitelist
    chrome.contextMenus.create({
      id: 'tempWhitelistDomain',
      parentId: 'contentShield',
      title: 'Allow for 30 minutes',
      contexts: ['page']
    });
    
    // Separator
    chrome.contextMenus.create({
      id: 'separator1',
      parentId: 'contentShield',
      type: 'separator',
      contexts: ['page']
    });
    
    // Quick settings
    chrome.contextMenus.create({
      id: 'quickSettings',
      parentId: 'contentShield',
      title: 'Open Settings',
      contexts: ['page']
    });
    
    // Toggle protection
    chrome.contextMenus.create({
      id: 'toggleProtection',
      parentId: 'contentShield',
      title: 'Toggle Protection',
      contexts: ['page']
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.url) return;

    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;

      switch (info.menuItemId) {
        case 'blockDomain':
          const { customDomains } = await chrome.storage.local.get('customDomains');
          const domains = customDomains || [];
          
          if (!domains.includes(hostname)) {
            domains.push(hostname);
            await chrome.storage.local.set({ customDomains: domains });
            await updateBlockingRules();
            
            // Show notification
            showNotification('Domain blocked', `${hostname} has been added to the block list.`);
            chrome.tabs.reload(tab.id);
          }
          break;
          
        case 'whitelistDomain':
          const { whitelistedDomains } = await chrome.storage.local.get('whitelistedDomains');
          const whitelist = whitelistedDomains || [];
          
          if (!whitelist.includes(hostname)) {
            whitelist.push(hostname);
            await chrome.storage.local.set({ whitelistedDomains: whitelist });
            await updateBlockingRules();
            
            showNotification('Domain whitelisted', `${hostname} has been permanently whitelisted.`);
            chrome.tabs.reload(tab.id);
          }
          break;
          
        case 'tempWhitelistDomain':
          const { temporarilyWhitelisted } = await chrome.storage.local.get('temporarilyWhitelisted');
          const tempList = temporarilyWhitelisted || [];
          
          // Remove any existing entry for this domain
          const filtered = tempList.filter(e => e.domain !== hostname);
          filtered.push({ domain: hostname, timestamp: Date.now() });
          
          await chrome.storage.local.set({ temporarilyWhitelisted: filtered });
          showNotification('Temporary access granted', `${hostname} is allowed for 30 minutes.`);
          chrome.tabs.reload(tab.id);
          break;
          
        case 'quickSettings':
          chrome.runtime.openOptionsPage();
          break;
          
        case 'toggleProtection':
          const current = await chrome.storage.local.get('enabled');
          const newState = !current.enabled;
          await chrome.storage.local.set({ enabled: newState });
          await updateBlockingRules();
          
          const stats = await getStats();
          updateBadge(newState ? stats.blockedToday : 0);
          showNotification('Protection toggled', newState ? 'Content Shield is now ON' : 'Content Shield is now OFF');
          break;
      }
    } catch (error) {
      console.error('Context menu error:', error);
    }
  });
} else {
  console.warn('Context menus API not available in this environment.');
}

// Show notification helper
function showNotification(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('imgs/icon48.png'),
      title: title,
      message: message
    });
  }
}

// Listen for keyboard shortcuts
chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  switch (command) {
    case 'toggle-protection':
      const current = await chrome.storage.local.get('enabled');
      const newState = !current.enabled;
      await chrome.storage.local.set({ enabled: newState });
      await updateBlockingRules();
      
      const stats = await getStats();
      updateBadge(newState ? stats.blockedToday : 0);
      showNotification('Protection toggled', newState ? 'Content Shield is now ON' : 'Content Shield is now OFF');
      break;
      
    case 'open-settings':
      chrome.runtime.openOptionsPage();
      break;
      
    case 'quick-whitelist':
      if (tab && tab.url) {
        const url = new URL(tab.url);
        const { whitelistedDomains } = await chrome.storage.local.get('whitelistedDomains');
        const whitelist = whitelistedDomains || [];
        
        if (!whitelist.includes(url.hostname)) {
          whitelist.push(url.hostname);
          await chrome.storage.local.set({ whitelistedDomains: whitelist });
          await updateBlockingRules();
          showNotification('Domain whitelisted', `${url.hostname} has been whitelisted.`);
        }
      }
      break;
  }
});

// Initialize badge on startup
chrome.runtime.onStartup.addListener(async () => {
  const stats = await getStats();
  updateBadge(stats.blockedToday);
  
  // Clean up expired temporary whitelists
  const { temporarilyWhitelisted } = await chrome.storage.local.get('temporarilyWhitelisted');
  if (temporarilyWhitelisted) {
    const now = Date.now();
    const valid = temporarilyWhitelisted.filter(e => now - e.timestamp < 30 * 60 * 1000);
    await chrome.storage.local.set({ temporarilyWhitelisted: valid });
  }
});

// Handle service worker lifecycle
self.addEventListener('install', (event) => {
  console.log('Content Shield service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Content Shield service worker activated');
  event.waitUntil(clients.claim());
});

// Web request monitoring for additional blocking (where supported)
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      // Additional request blocking logic can be added here
      return { cancel: false };
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );
}

// ============================================
// AI Integration and Bad Boy Notification System
// ============================================

const AIManager = {
  enabled: true,
  badBoyCount: 0,
  aiStats: {
    totalAnalyzed: 0,
    blockedByAI: 0,
    falsePositives: 0
  },

  async init() {
    const { aiSettings, badBoyCount } = await chrome.storage.local.get(['aiSettings', 'badBoyCount']);
    if (aiSettings) {
      this.enabled = aiSettings.enabled !== false;
    }
    this.badBoyCount = badBoyCount || 0;
    console.log('🧠 AI Manager initialized. Bad Boy count:', this.badBoyCount);
  },

  async analyzeURL(url, tabId) {
    if (!this.enabled) return { blocked: false, confidence: 0 };

    // Get filter data
    const { filters, customDomains, customKeywords } = await chrome.storage.local.get([
      'filters', 'customDomains', 'customKeywords'
    ]);

    const urlLower = url.toLowerCase();
    let confidence = 0;
    let matchedKeywords = [];

    // Domain matching (high weight)
    const allDomains = [...(filters?.adult || []), ...(customDomains || [])];
    for (const domain of allDomains) {
      if (urlLower.includes(domain.toLowerCase())) {
        confidence += 0.6;
        matchedKeywords.push(domain);
        break;
      }
    }

    // Keyword matching
    const allKeywords = [...(filters?.keywords || []), ...(customKeywords || [])];
    for (const keyword of allKeywords) {
      if (urlLower.includes(keyword.toLowerCase())) {
        confidence += 0.15;
        matchedKeywords.push(keyword);
      }
    }

    // Cap at 1.0
    confidence = Math.min(confidence, 1.0);

    this.aiStats.totalAnalyzed++;

    if (confidence >= 0.7) {
      this.aiStats.blockedByAI++;
      await this.showBadBoyNotification(url, confidence, matchedKeywords, tabId);
    }

    return {
      blocked: confidence >= 0.7,
      confidence: confidence,
      matchedKeywords: matchedKeywords
    };
  },

  async showBadBoyNotification(url, confidence, keywords, tabId) {
    this.badBoyCount++;
    await chrome.storage.local.set({ badBoyCount: this.badBoyCount });

    const hostname = new URL(url).hostname;

    // Show browser notification
    const title = confidence >= 0.9 ? '🔴 BAD BOY DETECTED!' : '⚠️ BAD BOY ALERT!';
    const message = `Blocked: ${hostname}\nAI Confidence: ${(confidence * 100).toFixed(1)}%\nAdult content detected!`;

    await chrome.notifications.create(`bad-boy-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'imgs/icon128.png',
      title: title,
      message: message,
      priority: 2,
      requireInteraction: confidence >= 0.9,
      buttons: [
        { title: 'Go Back' },
        { title: 'Dismiss' }
      ]
    });

    // Send to content script for popup
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'showBadBoyPopup',
        notification: {
          url: url,
          confidence: confidence,
          keywords: keywords,
          badBoyCount: this.badBoyCount,
          message: confidence >= 0.9 
            ? '🔴 BAD BOY! High-risk adult content blocked! Stay safe! 🛡️'
            : '⚠️ BAD BOY! Adult content detected and blocked! 🚫'
        }
      });
    } catch (e) {
      // Tab may not have content script loaded
    }

    console.log(`🔴 BAD BOY #${this.badBoyCount}: ${hostname} blocked (${(confidence * 100).toFixed(1)}%)`);
  },

  getStats() {
    return {
      ...this.aiStats,
      badBoyCount: this.badBoyCount,
      enabled: this.enabled
    };
  }
};

// Initialize AI on startup
chrome.runtime.onStartup.addListener(() => AIManager.init());
chrome.runtime.onInstalled.addListener(() => AIManager.init());

// Listen for navigation events to run AI analysis
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId === 0) { // Main frame only
    const result = await AIManager.analyzeURL(details.url, details.tabId);
    if (result.blocked) {
      // Redirect to blocked page
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(details.url)}&ai=true&confidence=${result.confidence}`)
      });
    }
  }
}, { url: [{ schemes: ['http', 'https'] }] });

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith('bad-boy-')) {
    if (buttonIndex === 0) {
      // Go back button
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.goBack(tabs[0].id);
        }
      });
    }
    chrome.notifications.clear(notificationId);
  }
});

// Message handler for AI queries
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'aiCheck') {
    AIManager.analyzeURL(message.url, sender.tab?.id).then(result => {
      sendResponse(result);
    });
    return true;
  } else if (message.action === 'getAIStats') {
    sendResponse(AIManager.getStats());
  } else if (message.action === 'getBadBoyCount') {
    sendResponse({ count: AIManager.badBoyCount });
  } else if (message.action === 'resetBadBoyCount') {
    AIManager.badBoyCount = 0;
    chrome.storage.local.set({ badBoyCount: 0 });
    sendResponse({ reset: true });
  }
});

console.log('🛡️ Content Shield background service worker initialized v2.0 with AI');
console.log('🧠 AI-powered Bad Boy detection system active');