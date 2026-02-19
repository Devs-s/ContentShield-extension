// Blocked page logic for Content Shield extension

(function() {
  'use strict';

  // DOM elements
  let elements = {};
  let blockedURL = '';
  let blockedDomain = '';
  let blockReason = '';

  // Initialize the blocked page
  function init() {
    // Get DOM elements
    elements = {
      blockedDomain: document.getElementById('blockedDomain'),
      blockedURL: document.getElementById('blockedURL'),
      blockReason: document.getElementById('blockReason'),
      blockTime: document.getElementById('blockTime'),
      goBackBtn: document.getElementById('goBackBtn'),
      goHomeBtn: document.getElementById('goHomeBtn'),
      reportBtn: document.getElementById('reportBtn'),
      overrideBtn: document.getElementById('overrideBtn'),
      passwordSection: document.getElementById('passwordSection'),
      passwordInput: document.getElementById('passwordInput'),
      submitPasswordBtn: document.getElementById('submitPasswordBtn'),
      cancelPasswordBtn: document.getElementById('cancelPasswordBtn'),
      errorMessage: document.getElementById('errorMessage'),
      statsBlocked: document.getElementById('statsBlocked'),
      statsToday: document.getElementById('statsToday'),
      statsThisWeek: document.getElementById('statsThisWeek')
    };

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    blockedURL = decodeURIComponent(urlParams.get('url') || '');
    blockReason = urlParams.get('reason') || 'potentially inappropriate content';

    // Parse blocked URL
    if (blockedURL) {
      try {
        const url = new URL(blockedURL);
        blockedDomain = url.hostname;
      } catch (e) {
        blockedDomain = 'Unknown Domain';
      }
    }

    // Display blocked information
    displayBlockedInfo();

    // Load and display statistics
    loadStatistics();

    // Setup event listeners
    setupEventListeners();

    // Log this block attempt
    logBlockAttempt();
  }

  // Display blocked page information
  function displayBlockedInfo() {
    if (elements.blockedDomain) {
      elements.blockedDomain.textContent = blockedDomain;
    }

    if (elements.blockedURL) {
      elements.blockedURL.textContent = blockedURL;
      elements.blockedURL.title = blockedURL;
    }

    if (elements.blockReason) {
      elements.blockReason.textContent = `Blocked due to: ${blockReason}`;
    }

    if (elements.blockTime) {
      const now = new Date();
      elements.blockTime.textContent = now.toLocaleString();
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Go back button
    if (elements.goBackBtn) {
      elements.goBackBtn.addEventListener('click', goBack);
    }

    // Go home button
    if (elements.goHomeBtn) {
      elements.goHomeBtn.addEventListener('click', goHome);
    }

    // Report false positive button
    if (elements.reportBtn) {
      elements.reportBtn.addEventListener('click', reportFalsePositive);
    }

    // Override/whitelist button
    if (elements.overrideBtn) {
      elements.overrideBtn.addEventListener('click', showOverridePrompt);
    }

    // Submit password button
    if (elements.submitPasswordBtn) {
      elements.submitPasswordBtn.addEventListener('click', checkPassword);
    }

    // Cancel password button
    if (elements.cancelPasswordBtn) {
      elements.cancelPasswordBtn.addEventListener('click', hidePasswordPrompt);
    }

    // Enter key in password input
    if (elements.passwordInput) {
      elements.passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          checkPassword();
        }
      });
    }
  }

  // Go back to previous page
  function goBack() {
    // Try to go back in history
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // If no history, go to a safe default page
      window.location.href = 'about:blank';
    }
  }

  // Go to home page
  function goHome() {
    chrome.storage.local.get(['homePage'], (result) => {
      const homePage = result.homePage || 'https://www.google.com';
      window.location.href = homePage;
    });
  }

  // Report false positive
  function reportFalsePositive() {
    chrome.storage.local.get(['reportedSites'], (result) => {
      const reportedSites = result.reportedSites || [];
      
      const report = {
        url: blockedURL,
        domain: blockedDomain,
        reason: blockReason,
        timestamp: Date.now()
      };

      reportedSites.push(report);

      chrome.storage.local.set({ reportedSites }, () => {
        showSuccessMessage('False positive reported. Thank you for helping improve our filters!');
        
        // Disable report button temporarily
        if (elements.reportBtn) {
          elements.reportBtn.disabled = true;
          elements.reportBtn.textContent = 'Reported';
        }
        
        // Update filter files to remove this false positive
        updateFiltersToRemoveFalsePositive(blockedDomain);
      });
    });
  }

  // Update filters to remove false positive
  function updateFiltersToRemoveFalsePositive(domainToRemove) {
    // Send message to background to update filters
    chrome.runtime.sendMessage({
      action: 'updateFilters',
      data: {
        type: 'remove_false_positive',
        domain: domainToRemove
      }
    });
  }

  // Show password prompt
  function showPasswordPrompt() {
    if (elements.passwordSection) {
      elements.passwordSection.style.display = 'block';
      elements.overrideBtn.style.display = 'none';
      
      // Focus password input
      if (elements.passwordInput) {
        elements.passwordInput.focus();
      }
    }
  }

  // Show override prompt
  function showOverridePrompt() {
    chrome.storage.local.get(['overridePassword', 'passwordEnabled'], (result) => {
      const overridePassword = result.overridePassword || '';
      const passwordEnabled = result.passwordEnabled || false;
      
      if (passwordEnabled) {
        showPasswordPrompt();
      } else {
        // Directly allow access
        addToWhitelist();
        showSuccessMessage('Access granted. Redirecting...');
        setTimeout(() => {
          window.location.href = blockedURL;
        }, 1000);
      }
    });
  }

  // Hide password prompt
  function hidePasswordPrompt() {
    if (elements.passwordSection) {
      elements.passwordSection.style.display = 'none';
      elements.overrideBtn.style.display = 'inline-block';
      elements.passwordInput.value = '';
      hideErrorMessage();
    }
  }

  // Check password and potentially allow access
  async function checkPassword() {
    const passwordInput = elements.passwordInput.value;

    if (!passwordInput) {
      showErrorMessage('Please enter a password');
      return;
    }

    try {
      const result = await chrome.storage.local.get([
        'passwordProtected',
        'password',
        'overridePassword',
        'passwordEnabled'
      ]);

      const protectionEnabled = result.passwordProtected || result.passwordEnabled;
      const storedHash = result.password || '';
      const legacyPassword = result.overridePassword || '';

      if (!protectionEnabled) {
        showErrorMessage('Password protection is not enabled. Please configure in settings.');
        return;
      }

      let isValid = false;

      if (storedHash && typeof Utils !== 'undefined' && Utils.verifyPassword) {
        isValid = await Utils.verifyPassword(passwordInput, storedHash);
      } else if (legacyPassword) {
        isValid = passwordInput === legacyPassword;
      }

      if (isValid) {
        await addToWhitelist();
        showSuccessMessage('Access granted. Redirecting...');

        setTimeout(() => {
          window.location.href = blockedURL;
        }, 1000);
      } else {
        showErrorMessage('Incorrect password. Access denied.');
        elements.passwordInput.value = '';
        elements.passwordInput.focus();
      }
    } catch (error) {
      showErrorMessage('Error checking password. Please try again.');
      console.error('Password check error:', error);
    }
  }

  // Add domain to whitelist
  async function addToWhitelist() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['whitelistedDomains'], (result) => {
        const whitelistedDomains = result.whitelistedDomains || [];
        
        if (!whitelistedDomains.includes(blockedDomain)) {
          whitelistedDomains.push(blockedDomain);
          
          chrome.storage.local.set({ whitelistedDomains }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  }

  // Load and display statistics
  function loadStatistics() {
    const applyStats = (stats) => {
      if (elements.statsBlocked) {
        elements.statsBlocked.textContent = stats.totalBlocked || 0;
      }

      if (elements.statsToday) {
        elements.statsToday.textContent = stats.blockedToday || 0;
      }

      if (elements.statsThisWeek) {
        elements.statsThisWeek.textContent = stats.blockedThisWeek || 0;
      }
    };

    chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Fallback to direct storage read
        chrome.storage.local.get(['blockStats'], (result) => {
          const stats = result.blockStats || {
            totalBlocked: 0,
            blockedToday: 0,
            blockedThisWeek: 0,
            lastReset: Date.now()
          };
          applyStats(stats);
        });
      } else {
        applyStats(response);
      }
    });
  }

  // Log this block attempt
  function logBlockAttempt() {
    const payload = {
      url: blockedURL,
      domain: blockedDomain,
      reason: blockReason
    };

    // Prefer logging through background to keep stats consistent
    chrome.runtime.sendMessage({ action: 'logBlock', data: payload }).catch(() => {
      // Fallback if service worker unavailable
      chrome.storage.local.get(['blockStats', 'blockHistory'], (result) => {
        const stats = result.blockStats || {
          totalBlocked: 0,
          blockedToday: 0,
          blockedThisWeek: 0,
          lastReset: Date.now()
        };

        const history = Array.isArray(result.blockHistory) ? [...result.blockHistory] : [];

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

        history.unshift({ ...payload, timestamp: now });
        if (history.length > 100) history.splice(100);

        chrome.storage.local.set({ blockStats: stats, blockHistory: history });
      });
    });
  }

  // Show success message
  function showSuccessMessage(message) {
    if (elements.errorMessage) {
      elements.errorMessage.textContent = message;
      elements.errorMessage.className = 'message success show';
      
      setTimeout(() => {
        elements.errorMessage.classList.remove('show');
      }, 5000);
    }
  }

  // Show error message
  function showErrorMessage(message) {
    if (elements.errorMessage) {
      elements.errorMessage.textContent = message;
      elements.errorMessage.className = 'message error show';
    }
  }

  // Hide error message
  function hideErrorMessage() {
    if (elements.errorMessage) {
      elements.errorMessage.classList.remove('show');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();