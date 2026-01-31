// ============================================
// Content Shield Extension - Options Page Logic
// ============================================

let currentSettings = null;
let isPasswordProtected = false;

// ============================================
// Initialize Options Page
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkPasswordProtection();
  initializeTabs();
  populateSettings();
  attachEventListeners();
  checkUrlHash();
  loadStatistics();
  loadBlockedHistory();
  loadWhitelist();
  loadCustomLists();
});

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
// Check Password Protection
// ============================================

async function checkPasswordProtection() {
  if (currentSettings.passwordProtected && currentSettings.password) {
    isPasswordProtected = true;
    showPasswordPrompt();
  }
}

// ============================================
// Show Password Prompt
// ============================================

function showPasswordPrompt() {
  const overlay = document.getElementById('passwordOverlay');
  overlay.style.display = 'flex';
  document.getElementById('passwordInput').focus();
}

// ============================================
// Verify Password
// ============================================

async function verifyPassword() {
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');
  const password = input.value;
  
  if (!password) {
    error.textContent = 'Please enter password';
    return;
  }
  
  const isValid = await Utils.verifyPassword(password, currentSettings.password);
  
  if (isValid) {
    document.getElementById('passwordOverlay').style.display = 'none';
    error.textContent = '';
    input.value = '';
  } else {
    error.textContent = 'Incorrect password';
    input.value = '';
    input.focus();
  }
}

// ============================================
// Initialize Tabs
// ============================================

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update active tab content
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');
      
      // Update URL hash
      window.location.hash = tabName;
    });
  });
}

// ============================================
// Check URL Hash for Direct Navigation
// ============================================

function checkUrlHash() {
  const hash = window.location.hash.substring(1);
  if (hash) {
    const tabButton = document.querySelector(`[data-tab="${hash}"]`);
    if (tabButton) {
      tabButton.click();
    }
  }
}

// ============================================
// Populate Settings Form
// ============================================

function populateSettings() {
  // General Settings
  document.getElementById('enabledToggle').checked = currentSettings.enabled;
  document.getElementById('blockingLevel').value = currentSettings.blockingLevel;
  document.getElementById('showBlockedPage').checked = currentSettings.showBlockedPage;
  document.getElementById('logBlocked').checked = currentSettings.logBlocked;
  
  // Password Protection
  document.getElementById('passwordProtection').checked = currentSettings.passwordProtected;
  togglePasswordFields();
}

// ============================================
// Attach Event Listeners
// ============================================

function attachEventListeners() {
  // General Settings
  document.getElementById('enabledToggle')?.addEventListener('change', saveGeneralSettings);
  document.getElementById('blockingLevel')?.addEventListener('change', saveGeneralSettings);
  document.getElementById('showBlockedPage')?.addEventListener('change', saveGeneralSettings);
  document.getElementById('logBlocked')?.addEventListener('change', saveGeneralSettings);
  
  // Save buttons
  document.getElementById('saveGeneralBtn')?.addEventListener('click', saveGeneralSettings);
  document.getElementById('savePasswordBtn')?.addEventListener('click', savePasswordSettings);
  
  // Password
  document.getElementById('passwordProtection')?.addEventListener('change', togglePasswordFields);
  document.getElementById('passwordOverlayBtn')?.addEventListener('click', verifyPassword);
  document.getElementById('passwordInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
  });
  
  // Custom Lists
  document.getElementById('addDomainBtn')?.addEventListener('click', addCustomDomain);
  document.getElementById('addKeywordBtn')?.addEventListener('click', addCustomKeyword);
  document.getElementById('customDomainInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCustomDomain();
  });
  document.getElementById('customKeywordInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCustomKeyword();
  });
  
  // Statistics
  document.getElementById('resetStatsBtn')?.addEventListener('click', resetStatistics);
  document.getElementById('exportStatsBtn')?.addEventListener('click', exportStatistics);
  
  // Data Management
  document.getElementById('exportSettingsBtn')?.addEventListener('click', exportSettings);
  document.getElementById('importSettingsBtn')?.addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput')?.addEventListener('change', importSettings);
  document.getElementById('resetAllBtn')?.addEventListener('click', resetAllSettings);
  
  // Clear History
  document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);
}

// ============================================
// Save General Settings
// ============================================

async function saveGeneralSettings() {
  try {
    currentSettings.enabled = document.getElementById('enabledToggle').checked;
    currentSettings.blockingLevel = document.getElementById('blockingLevel').value;
    currentSettings.showBlockedPage = document.getElementById('showBlockedPage').checked;
    currentSettings.logBlocked = document.getElementById('logBlocked').checked;
    
    await Utils.saveSettings(currentSettings);
    
    // Notify background script
    chrome.runtime.sendMessage({
      action: 'settingsUpdated',
      settings: currentSettings
    });
    
    showNotification('Settings saved successfully', 'success');
  } catch (e) {
    Utils.log('Error saving settings: ' + e, 'error');
    showNotification('Error saving settings', 'error');
  }
}

// ============================================
// Toggle Password Fields
// ============================================

function togglePasswordFields() {
  const isEnabled = document.getElementById('passwordProtection').checked;
  const passwordFields = document.getElementById('passwordFields');
  passwordFields.style.display = isEnabled ? 'block' : 'none';
}

// ============================================
// Save Password Settings
// ============================================

async function savePasswordSettings() {
  try {
    const enabled = document.getElementById('passwordProtection').checked;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (enabled && !currentSettings.password && !newPassword) {
      showNotification('Please enter a password', 'error');
      return;
    }
    
    if (enabled && newPassword) {
      if (newPassword !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
      }
      
      if (newPassword.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
      }
      
      currentSettings.password = await Utils.hashPassword(newPassword);
    }
    
    currentSettings.passwordProtected = enabled;
    
    await Utils.saveSettings(currentSettings);
    
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    
    showNotification('Password settings saved', 'success');
  } catch (e) {
    Utils.log('Error saving password: ' + e, 'error');
    showNotification('Error saving password settings', 'error');
  }
}

// ============================================
// Load Statistics
// ============================================

async function loadStatistics() {
  try {
    const stats = await Utils.getStatistics();
    const history = await Utils.getBlockedHistory(1000);
    
    document.getElementById('totalBlockedStat').textContent = stats.totalBlocked.toLocaleString();
    document.getElementById('lastResetDate').textContent = Utils.formatDate(stats.lastReset);
    
    // Calculate today's blocks
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayBlocks = history.filter(entry => entry.timestamp >= todayStart).length;
    document.getElementById('todayBlockedStat').textContent = todayBlocks.toLocaleString();
    
    // Calculate this week's blocks
    const weekStart = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const weekBlocks = history.filter(entry => entry.timestamp >= weekStart).length;
    document.getElementById('weekBlockedStat').textContent = weekBlocks.toLocaleString();
    
    // Generate chart if available
    generateBlockingChart(history);
  } catch (e) {
    Utils.log('Error loading statistics: ' + e, 'error');
  }
}

// ============================================
// Generate Blocking Chart
// ============================================

function generateBlockingChart(history) {
  const canvas = document.getElementById('blockingChart');
  if (!canvas) return;
  
  // Group by day for last 7 days
  const days = [];
  const counts = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const dayStart = date.getTime();
    const dayEnd = dayStart + (24 * 60 * 60 * 1000);
    
    const dayBlocks = history.filter(entry => 
      entry.timestamp >= dayStart && entry.timestamp < dayEnd
    ).length;
    
    days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
    counts.push(dayBlocks);
  }
  
  // Simple bar chart visualization
  const chartContainer = document.getElementById('chartContainer');
  chartContainer.innerHTML = '';
  
  const maxCount = Math.max(...counts, 1);
  
  days.forEach((day, index) => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    
    const barFill = document.createElement('div');
    barFill.className = 'chart-bar-fill';
    barFill.style.height = `${(counts[index] / maxCount) * 100}%`;
    
    const barLabel = document.createElement('div');
    barLabel.className = 'chart-bar-label';
    barLabel.textContent = day;
    
    const barValue = document.createElement('div');
    barValue.className = 'chart-bar-value';
    barValue.textContent = counts[index];
    
    bar.appendChild(barValue);
    bar.appendChild(barFill);
    bar.appendChild(barLabel);
    chartContainer.appendChild(bar);
  });
}

// ============================================
// Load Blocked History
// ============================================

async function loadBlockedHistory() {
  try {
    const history = await Utils.getBlockedHistory(100);
    const container = document.getElementById('historyList');
    
    if (history.length === 0) {
      container.innerHTML = '<div class="no-data">No blocked history yet</div>';
      return;
    }
    
    container.innerHTML = '';
    
    history.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      item.innerHTML = `
        <div class="history-domain">${entry.domain}</div>
        <div class="history-url">${entry.url}</div>
        <div class="history-time">${Utils.formatDate(entry.timestamp)}</div>
      `;
      
      container.appendChild(item);
    });
  } catch (e) {
    Utils.log('Error loading history: ' + e, 'error');
  }
}

// ============================================
// Load Whitelist
// ============================================

async function loadWhitelist() {
  try {
    const whitelisted = currentSettings.whitelistedDomains || [];
    const container = document.getElementById('whitelistList');
    
    if (whitelisted.length === 0) {
      container.innerHTML = '<div class="no-data">No whitelisted domains</div>';
      return;
    }
    
    container.innerHTML = '';
    
    whitelisted.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'list-item';
      
      const domainText = document.createElement('span');
      domainText.textContent = domain;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => removeWhitelistedDomain(domain);
      
      item.appendChild(domainText);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });
  } catch (e) {
    Utils.log('Error loading whitelist: ' + e, 'error');
  }
}

// ============================================
// Remove Whitelisted Domain
// ============================================

async function removeWhitelistedDomain(domain) {
  try {
    currentSettings.whitelistedDomains = currentSettings.whitelistedDomains.filter(d => d !== domain);
    await Utils.saveSettings(currentSettings);
    loadWhitelist();
    showNotification(`Removed ${domain} from whitelist`, 'success');
  } catch (e) {
    Utils.log('Error removing domain: ' + e, 'error');
    showNotification('Error removing domain', 'error');
  }
}

// ============================================
// Load Custom Lists
// ============================================

async function loadCustomLists() {
  loadCustomDomains();
  loadCustomKeywords();
}

// ============================================
// Load Custom Domains
// ============================================

function loadCustomDomains() {
  const container = document.getElementById('customDomainsList');
  const domains = currentSettings.customDomains || [];
  
  if (domains.length === 0) {
    container.innerHTML = '<div class="no-data">No custom domains added</div>';
    return;
  }
  
  container.innerHTML = '';
  
  domains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'list-item';
    
    const domainText = document.createElement('span');
    domainText.textContent = domain;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => removeCustomDomain(domain);
    
    item.appendChild(domainText);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

// ============================================
// Load Custom Keywords
// ============================================

function loadCustomKeywords() {
  const container = document.getElementById('customKeywordsList');
  const keywords = currentSettings.customKeywords || [];
  
  if (keywords.length === 0) {
    container.innerHTML = '<div class="no-data">No custom keywords added</div>';
    return;
  }
  
  container.innerHTML = '';
  
  keywords.forEach(keyword => {
    const item = document.createElement('div');
    item.className = 'list-item';
    
    const keywordText = document.createElement('span');
    keywordText.textContent = keyword;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => removeCustomKeyword(keyword);
    
    item.appendChild(keywordText);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

// ============================================
// Add Custom Domain
// ============================================

async function addCustomDomain() {
  const input = document.getElementById('customDomainInput');
  const domain = input.value.trim();
  
  if (!domain) return;
  
  try {
    await Utils.addCustomDomain(domain);
    currentSettings = await Utils.getSettings();
    input.value = '';
    loadCustomDomains();
    showNotification(`Added ${domain} to blocked list`, 'success');
  } catch (e) {
    Utils.log('Error adding domain: ' + e, 'error');
    showNotification('Error adding domain', 'error');
  }
}

// ============================================
// Remove Custom Domain
// ============================================

async function removeCustomDomain(domain) {
  try {
    await Utils.removeCustomDomain(domain);
    currentSettings = await Utils.getSettings();
    loadCustomDomains();
    showNotification(`Removed ${domain} from blocked list`, 'success');
  } catch (e) {
    Utils.log('Error removing domain: ' + e, 'error');
    showNotification('Error removing domain', 'error');
  }
}

// ============================================
// Add Custom Keyword
// ============================================

async function addCustomKeyword() {
  const input = document.getElementById('customKeywordInput');
  const keyword = input.value.trim().toLowerCase();
  
  if (!keyword) return;
  
  try {
    const keywords = currentSettings.customKeywords || [];
    
    if (!keywords.includes(keyword)) {
      keywords.push(keyword);
      currentSettings.customKeywords = keywords;
      await Utils.saveSettings(currentSettings);
      input.value = '';
      loadCustomKeywords();
      showNotification(`Added "${keyword}" to blocked keywords`, 'success');
    } else {
      showNotification('Keyword already exists', 'warning');
    }
  } catch (e) {
    Utils.log('Error adding keyword: ' + e, 'error');
    showNotification('Error adding keyword', 'error');
  }
}

// ============================================
// Remove Custom Keyword
// ============================================

async function removeCustomKeyword(keyword) {
  try {
    currentSettings.customKeywords = currentSettings.customKeywords.filter(k => k !== keyword);
    await Utils.saveSettings(currentSettings);
    loadCustomKeywords();
    showNotification(`Removed "${keyword}" from blocked keywords`, 'success');
  } catch (e) {
    Utils.log('Error removing keyword: ' + e, 'error');
    showNotification('Error removing keyword', 'error');
  }
}

// ============================================
// Reset Statistics
// ============================================

async function resetStatistics() {
  if (!confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
    return;
  }
  
  try {
    await Utils.resetStatistics();
    loadStatistics();
    showNotification('Statistics reset successfully', 'success');
  } catch (e) {
    Utils.log('Error resetting statistics: ' + e, 'error');
    showNotification('Error resetting statistics', 'error');
  }
}

// ============================================
// Export Statistics
// ============================================

async function exportStatistics() {
  try {
    const stats = await Utils.getStatistics();
    const history = await Utils.getBlockedHistory(1000);
    
    const data = {
      statistics: stats,
      history: history,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-shield-stats-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Statistics exported successfully', 'success');
  } catch (e) {
    Utils.log('Error exporting statistics: ' + e, 'error');
    showNotification('Error exporting statistics', 'error');
  }
}

// ============================================
// Clear History
// ============================================

async function clearHistory() {
  if (!confirm('Are you sure you want to clear all blocked history? This cannot be undone.')) {
    return;
  }
  
  try {
    await Utils.setStorage({ blockedHistory: [] });
    loadBlockedHistory();
    showNotification('History cleared successfully', 'success');
  } catch (e) {
    Utils.log('Error clearing history: ' + e, 'error');
    showNotification('Error clearing history', 'error');
  }
}

// ============================================
// Export Settings
// ============================================

async function exportSettings() {
  try {
    const data = await Utils.exportSettings();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-shield-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Settings exported successfully', 'success');
  } catch (e) {
    Utils.log('Error exporting settings: ' + e, 'error');
    showNotification('Error exporting settings', 'error');
  }
}

// ============================================
// Import Settings
// ============================================

async function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const success = await Utils.importSettings(text);
    
    if (success) {
      currentSettings = await Utils.getSettings();
      populateSettings();
      loadCustomLists();
      loadWhitelist();
      loadStatistics();
      loadBlockedHistory();
      showNotification('Settings imported successfully', 'success');
    } else {
      showNotification('Error importing settings', 'error');
    }
  } catch (e) {
    Utils.log('Error importing settings: ' + e, 'error');
    showNotification('Invalid settings file', 'error');
  }
  
  event.target.value = '';
}

// ============================================
// Reset All Settings
// ============================================

async function resetAllSettings() {
  if (!confirm('Are you sure you want to reset ALL settings to defaults? This will erase all custom configurations, whitelist, and history. This cannot be undone.')) {
    return;
  }
  
  try {
    await Utils.clearStorage();
    currentSettings = await Utils.getSettings();
    populateSettings();
    loadCustomLists();
    loadWhitelist();
    loadStatistics();
    loadBlockedHistory();
    showNotification('All settings reset to defaults', 'success');
  } catch (e) {
    Utils.log('Error resetting settings: ' + e, 'error');
    showNotification('Error resetting settings', 'error');
  }
}

// ============================================
// Show Notification
// ============================================

function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type} show`;
  
  setTimeout(() => {
    notification.className = 'notification';
  }, 3000);
}