// ============================================
// Content Shield Extension - Popup Logic
// ============================================

let currentTab = null;
let currentSettings = null;

// ============================================
// Initialize Popup
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTab();
  await loadSettings();
  await updateUI();
  attachEventListeners();
  startAutoRefresh();
});

// ============================================
// Load Current Tab Info
// ============================================

async function loadCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
  } catch (e) {
    Utils.log('Error loading current tab: ' + e, 'error');
  }
}

// ============================================
// Load Settings
// ============================================

async function loadSettings() {
  try {
    currentSettings = await Utils.getSettings();
  } catch (e) {
    Utils.log('Error loading settings: ' + e, 'error');
  }
}

// ============================================
// Update UI Elements
// ============================================

async function updateUI() {
  await updateStatus();
  await updateStatistics();
  await updateCurrentSite();
  await updateRecentBlocked();
  await updateToggleButton();
}

// ============================================
// Update Extension Status
// ============================================

async function updateStatus() {
  const statusEl = document.getElementById('status');
  const statusDot = document.getElementById('statusDot');
  
  if (currentSettings.enabled) {
    statusEl.textContent = 'Protection Active';
    statusEl.className = 'status active';
    statusDot.className = 'status-dot active';
  } else {
    statusEl.textContent = 'Protection Disabled';
    statusEl.className = 'status disabled';
    statusDot.className = 'status-dot disabled';
  }
}

// ============================================
// Update Statistics Display
// ============================================

async function updateStatistics() {
  const stats = await Utils.getStatistics();
  const totalBlockedEl = document.getElementById('totalBlocked');
  const todayBlockedEl = document.getElementById('todayBlocked');
  
  totalBlockedEl.textContent = stats.totalBlocked.toLocaleString();
  
  // Calculate today's blocks
  const history = await Utils.getBlockedHistory(1000);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayBlocks = history.filter(entry => entry.timestamp >= todayStart).length;
  
  todayBlockedEl.textContent = todayBlocks.toLocaleString();
}

// ============================================
// Update Current Site Info
// ============================================

async function updateCurrentSite() {
  const currentSiteEl = document.getElementById('currentSite');
  const siteStatusEl = document.getElementById('siteStatus');
  const whitelistBtn = document.getElementById('whitelistBtn');
  
  if (!currentTab || !currentTab.url) {
    currentSiteEl.textContent = 'No active tab';
    siteStatusEl.textContent = '';
    whitelistBtn.style.display = 'none';
    return;
  }
  
  const domain = Utils.extractDomain(currentTab.url);
  
  // Don't show for chrome:// or extension pages
  if (currentTab.url.startsWith('chrome://') || 
      currentTab.url.startsWith('chrome-extension://') ||
      currentTab.url.startsWith('about:')) {
    currentSiteEl.textContent = 'System page';
    siteStatusEl.textContent = '';
    whitelistBtn.style.display = 'none';
    return;
  }
  
  currentSiteEl.textContent = domain;
  
  // Check if whitelisted
  const isWhitelisted = await Utils.isWhitelisted(currentTab.url);
  
  if (isWhitelisted) {
    siteStatusEl.textContent = '✓ Whitelisted';
    siteStatusEl.className = 'site-status whitelisted';
    whitelistBtn.textContent = 'Remove from Whitelist';
    whitelistBtn.style.display = 'block';
  } else {
    // Check if would be blocked
    const blockedPatterns = await getBlockedPatterns();
    const wouldBlock = Utils.matchesBlockedPattern(currentTab.url, blockedPatterns);
    
    if (wouldBlock) {
      siteStatusEl.textContent = '🛡️ Would be blocked';
      siteStatusEl.className = 'site-status blocked';
    } else {
      siteStatusEl.textContent = '✓ Allowed';
      siteStatusEl.className = 'site-status allowed';
    }
    
    whitelistBtn.textContent = 'Add to Whitelist';
    whitelistBtn.style.display = 'block';
  }
}

// ============================================
// Get Blocked Patterns
// ============================================

async function getBlockedPatterns() {
  const patterns = [
    '*porn*', '*xxx*', '*sex*', '*adult*', '*nsfw*',
    '*nude*', '*erotic*', '*hentai*', '*cam*'
  ];
  
  // Add custom keywords
  if (currentSettings.customKeywords) {
    patterns.push(...currentSettings.customKeywords.map(k => `*${k}*`));
  }
  
  // Add custom domains
  if (currentSettings.customDomains) {
    patterns.push(...currentSettings.customDomains.map(d => `*${d}*`));
  }
  
  return patterns;
}

// ============================================
// Update Recent Blocked List
// ============================================

async function updateRecentBlocked() {
  const recentList = document.getElementById('recentBlockedList');
  const history = await Utils.getBlockedHistory(5);
  
  if (history.length === 0) {
    recentList.innerHTML = '<div class="no-blocks">No blocked attempts yet</div>';
    return;
  }
  
  recentList.innerHTML = '';
  
  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'blocked-item';
    
    const domainEl = document.createElement('div');
    domainEl.className = 'blocked-domain';
    domainEl.textContent = entry.domain;
    domainEl.title = entry.url;
    
    const timeEl = document.createElement('div');
    timeEl.className = 'blocked-time';
    timeEl.textContent = Utils.getRelativeTime(entry.timestamp);
    
    item.appendChild(domainEl);
    item.appendChild(timeEl);
    recentList.appendChild(item);
  });
}

// ============================================
// Update Toggle Button
// ============================================

async function updateToggleButton() {
  const toggleBtn = document.getElementById('toggleBtn');
  
  if (currentSettings.enabled) {
    toggleBtn.textContent = 'Disable Protection';
    toggleBtn.className = 'btn btn-danger';
  } else {
    toggleBtn.textContent = 'Enable Protection';
    toggleBtn.className = 'btn btn-primary';
  }
}

// ============================================
// Attach Event Listeners
// ============================================

function attachEventListeners() {
  // Toggle protection
  document.getElementById('toggleBtn')?.addEventListener('click', toggleProtection);
  
  // Whitelist current site
  document.getElementById('whitelistBtn')?.addEventListener('click', toggleWhitelist);
  
  // Open settings
  document.getElementById('settingsBtn')?.addEventListener('click', openSettings);
  
  // Open statistics
  document.getElementById('statsBtn')?.addEventListener('click', openStatistics);
  
  // View all blocked
  document.getElementById('viewAllBtn')?.addEventListener('click', viewAllBlocked);
  
  // Reset stats
  document.getElementById('resetStatsBtn')?.addEventListener('click', resetStats);
  
  // Quick actions
  document.getElementById('reportBtn')?.addEventListener('click', reportSite);
  document.getElementById('feedbackBtn')?.addEventListener('click', sendFeedback);
}

// ============================================
// Toggle Protection On/Off
// ============================================

async function toggleProtection() {
  try {
    const toggleBtn = document.getElementById('toggleBtn');
    toggleBtn.disabled = true;
    
    currentSettings.enabled = !currentSettings.enabled;
    await Utils.updateSetting('enabled', currentSettings.enabled);
    
    // Notify background script
    chrome.runtime.sendMessage({
      action: 'toggleProtection',
      enabled: currentSettings.enabled
    });
    
    await updateUI();
    
    // Show notification
    const message = currentSettings.enabled 
      ? 'Content filtering enabled' 
      : 'Content filtering disabled';
    showToast(message);
    
  } catch (e) {
    Utils.log('Error toggling protection: ' + e, 'error');
    showToast('Error toggling protection', 'error');
  } finally {
    document.getElementById('toggleBtn').disabled = false;
  }
}

// ============================================
// Toggle Whitelist for Current Site
// ============================================

async function toggleWhitelist() {
  if (!currentTab || !currentTab.url) return;
  
  try {
    const whitelistBtn = document.getElementById('whitelistBtn');
    whitelistBtn.disabled = true;
    
    const domain = Utils.getRootDomain(currentTab.url);
    const isWhitelisted = await Utils.isWhitelisted(currentTab.url);
    
    if (isWhitelisted) {
      // Remove from whitelist
      const whitelisted = currentSettings.whitelistedDomains || [];
      currentSettings.whitelistedDomains = whitelisted.filter(d => d !== domain);
      await Utils.updateSetting('whitelistedDomains', currentSettings.whitelistedDomains);
      showToast(`Removed ${domain} from whitelist`);
    } else {
      // Add to whitelist
      await Utils.addWhitelistedDomain(domain);
      currentSettings = await Utils.getSettings();
      showToast(`Added ${domain} to whitelist`);
    }
    
    // Notify background script
    chrome.runtime.sendMessage({
      action: 'whitelistUpdated'
    });
    
    await updateUI();
    
  } catch (e) {
    Utils.log('Error toggling whitelist: ' + e, 'error');
    showToast('Error updating whitelist', 'error');
  } finally {
    document.getElementById('whitelistBtn').disabled = false;
  }
}

// ============================================
// Open Settings Page
// ============================================

function openSettings() {
  chrome.runtime.openOptionsPage();
}

// ============================================
// Open Statistics View
// ============================================

function openStatistics() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('options.html#statistics')
  });
}

// ============================================
// View All Blocked History
// ============================================

function viewAllBlocked() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('options.html#history')
  });
}

// ============================================
// Reset Statistics
// ============================================

async function resetStats() {
  if (!confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
    return;
  }
  
  try {
    await Utils.resetStatistics();
    await Utils.setStorage({ blockedHistory: [] });
    await updateUI();
    showToast('Statistics reset successfully');
  } catch (e) {
    Utils.log('Error resetting stats: ' + e, 'error');
    showToast('Error resetting statistics', 'error');
  }
}

// ============================================
// Report Site
// ============================================

function reportSite() {
  if (!currentTab || !currentTab.url) return;
  
  const domain = Utils.extractDomain(currentTab.url);
  const subject = encodeURIComponent(`Report Site: ${domain}`);
  const body = encodeURIComponent(`I would like to report the following site:\n\nDomain: ${domain}\nURL: ${currentTab.url}\n\nReason:\n`);
  
  chrome.tabs.create({
    url: `mailto:support@example.com?subject=${subject}&body=${body}`
  });
}

// ============================================
// Send Feedback
// ============================================

function sendFeedback() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('options.html#feedback')
  });
}

// ============================================
// Show Toast Notification
// ============================================

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// ============================================
// Auto Refresh UI
// ============================================

function startAutoRefresh() {
  // Refresh UI every 10 seconds
  setInterval(async () => {
    await loadSettings();
    await updateStatistics();
    await updateRecentBlocked();
  }, 10000);
}

// ============================================
// Listen for Messages from Background
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'siteBlocked') {
    updateUI();
  } else if (message.action === 'settingsUpdated') {
    loadSettings().then(() => updateUI());
  }
});

// ============================================
// Handle Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + T: Toggle protection
  if ((e.ctrlKey || e.metaKey) && e.key === 't') {
    e.preventDefault();
    toggleProtection();
  }
  
  // Ctrl/Cmd + W: Toggle whitelist
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
    e.preventDefault();
    toggleWhitelist();
  }
  
  // Ctrl/Cmd + S: Open settings
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    openSettings();
  }
});