// Content script for Content Shield extension
// Runs on all web pages to analyze and filter content

(function() {
  'use strict';

  // Configuration
  let config = {
    enabled: true,
    strictMode: false,
    blockImages: true,
    blockVideos: true,
    customDomains: [],
    customKeywords: [],
    whitelistedDomains: []
  };

  let isBlocked = false;
  let observer = null;

  // Initialize the content filter
  async function init() {
    try {
      // Load settings from storage
      const settings = await chrome.storage.local.get([
        'enabled',
        'strictMode',
        'blockImages',
        'blockVideos',
        'customDomains',
        'customKeywords',
        'whitelistedDomains'
      ]);

      config = { ...config, ...settings };

      // Derive strict mode from blocking level when available
      if (settings.blockingLevel) {
        config.strictMode = settings.blockingLevel === 'strict';
      }

      // Ensure arrays are always defined
      config.customDomains = settings.customDomains || [];
      config.customKeywords = settings.customKeywords || [];
      config.whitelistedDomains = settings.whitelistedDomains || [];

      // Only proceed if filtering is enabled
      if (!config.enabled) {
        return;
      }

      // Check if current domain is whitelisted
      if (isWhitelisted()) {
        return;
      }

      // Check if URL should be blocked
      if (await shouldBlockURL()) {
        blockPage();
        return;
      }

      // Scan page content
      scanPageContent();

      // Monitor for dynamic content changes
      observePageChanges();

      // Listen for runtime messages
      setupMessageListener();

    } catch (error) {
      console.error('Content Shield initialization error:', error);
    }
  }

  // Check if current domain is whitelisted
  function isWhitelisted() {
    const hostname = window.location.hostname;
    return config.whitelistedDomains.some(domain => {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  }

  // Check if URL should be blocked based on patterns
  async function shouldBlockURL() {
    const url = window.location.href.toLowerCase();
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();

    // Never block the Content Shield GitHub repository
    if (hostname === 'github.com' && pathname.includes('/devs-s/contentshield-extension')) {
      return false;
    }

    // Always block URLs containing "porn" in main domain or path
    if (hostname.includes('porn') || pathname.includes('porn')) {
      logBlock('url_porn', 'porn in URL');
      return true;
    }

    // Only block obvious adult domains from filters - be very restrictive
    const obviousAdultDomains = config.customDomains.filter(domain => {
      const domainLower = domain.toLowerCase();
      
      // Exclude legitimate tech/development sites
      const isLegitimateTech = domainLower.includes('github') || 
                             domainLower.includes('git') ||
                             domainLower.includes('stack') ||
                             domainLower.includes('code') ||
                             domainLower.includes('dev') ||
                             domainLower.includes('api');
      
      // Only block clear adult domains
      const isObviousAdult = domainLower.includes('porn') || 
                             domainLower.includes('xxx') || 
                             domainLower.includes('sex') ||
                             domainLower.includes('adult') ||
                             domainLower.includes('nude') ||
                             domainLower.includes('erotic') ||
                             domainLower.includes('cam') ||
                             domainLower.includes('escort') ||
                             domainLower.includes('hookup');
      
      return isObviousAdult && !isLegitimateTech;
    });

    for (const domain of obviousAdultDomains) {
      const domainLower = domain.toLowerCase();
      if (hostname === domainLower || hostname.endsWith('.' + domainLower)) {
        logBlock('domain', domain);
        return true;
      }
    }

    // Check for adult terms in main path (not query parameters)
    const adultTerms = ['porn', 'xxx', 'sex', 'adult', 'nude', 'erotic', 'cam', 'escort', 'hookup'];
    const hasAdultInPath = adultTerms.some(term => pathname.includes(term));
    
    if (hasAdultInPath) {
      logBlock('path_adult', 'adult term in path');
      return true;
    }

    return false;
  }

  // Scan page content for inappropriate keywords
  function scanPageContent() {
    if (isBlocked) return;

    try {
      // Build a lightweight context (avoid full-body scans to reduce false positives)
      const title = document.title.toLowerCase();
      const metaDescription = getMetaDescription().toLowerCase();
      const urlText = window.location.href.toLowerCase();

      // Combine URL + title + meta only
      const contentToCheck = `${title} ${metaDescription} ${urlText}`;

      // Always block if content contains "porn"
      if (contentToCheck.includes('porn')) {
        logBlock('content_porn', 'porn in content');
        blockPage();
        return;
      }

      // Only check obvious adult keywords from filters - be very restrictive
      const obviousAdultKeywords = config.customKeywords.filter(keyword => {
        const keywordLower = keyword.toLowerCase();
        
        // Exclude legitimate tech/development terms
        const isLegitimateTech = keywordLower.includes('git') || 
                               keywordLower.includes('code') ||
                               keywordLower.includes('dev') ||
                               keywordLower.includes('api') ||
                               keywordLower.includes('stack') ||
                               keywordLower.includes('script') ||
                               keywordLower.includes('framework');
        
        // Only block clear adult terms
        const isObviousAdult = keywordLower.includes('porn') || 
                               keywordLower.includes('xxx') || 
                               keywordLower.includes('sex') ||
                               keywordLower.includes('nude') ||
                               keywordLower.includes('erotic') ||
                               keywordLower.includes('adult') ||
                               keywordLower.includes('cam') ||
                               keywordLower.includes('escort') ||
                               keywordLower.includes('hookup');
        
        return isObviousAdult && !isLegitimateTech;
      });
      
      for (const keyword of obviousAdultKeywords) {
        const keywordLower = keyword.toLowerCase();
        if (contentToCheck.includes(keywordLower)) {
          logBlock('keyword', keyword);
          blockPage();
          return;
        }
      }

      // Block inappropriate media if enabled
      if (config.blockImages) {
        blockInappropriateImages();
      }

      if (config.blockVideos) {
        blockInappropriateVideos();
      }

    } catch (error) {
      console.error('Content Shield scan error:', error);
    }
  }

  // Get meta description from page
  function getMetaDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');
    return metaDesc ? metaDesc.getAttribute('content') || '' : '';
  }

  // Block inappropriate images
  function blockInappropriateImages() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
      const alt = (img.alt || '').toLowerCase();
      const src = (img.src || '').toLowerCase();
      const title = (img.title || '').toLowerCase();

      // Check for suspicious attributes
      const checkText = `${alt} ${src} ${title}`;
      
      // Always block if image attributes contain "porn"
      if (checkText.includes('porn')) {
        blurElement(img);
        return;
      }
      
      // Check all custom keywords from filters
      for (const keyword of config.customKeywords) {
        if (checkText.includes(keyword.toLowerCase())) {
          blurElement(img);
          break;
        }
      }
    });
  }

  // Block inappropriate videos
  function blockInappropriateVideos() {
    const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
    
    videos.forEach(video => {
      const src = (video.src || '').toLowerCase();
      const title = (video.title || '').toLowerCase();

      const checkText = `${src} ${title}`;
      
      // Always block if video attributes contain "porn"
      if (checkText.includes('porn')) {
        blurElement(video);
        return;
      }
      
      // Check all custom keywords from filters
      for (const keyword of config.customKeywords) {
        if (checkText.includes(keyword.toLowerCase())) {
          blurElement(video);
          break;
        }
      }
    });
  }

  // Blur an element
  function blurElement(element) {
    element.style.filter = 'blur(20px)';
    element.style.pointerEvents = 'none';
    element.setAttribute('data-content-shield-blocked', 'true');
  }

  // Block the entire page
  function blockPage() {
    if (isBlocked) return;
    
    isBlocked = true;

    // Stop page execution
    if (observer) {
      observer.disconnect();
    }

    // Get blocked page URL
    const blockedPageURL = chrome.runtime.getURL('blocked.html');
    const currentURL = encodeURIComponent(window.location.href);
    
    // Redirect to blocked page
    window.location.replace(`${blockedPageURL}?url=${currentURL}`);
  }

  // Observe page changes (for SPAs and dynamic content)
  function observePageChanges() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      // Throttle the scanning to avoid performance issues
      if (isBlocked) return;
      
      // Check if significant content was added
      let shouldScan = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }

      if (shouldScan) {
        // Debounce the scan
        if (window.contentShieldScanTimeout) {
          clearTimeout(window.contentShieldScanTimeout);
        }
        
        window.contentShieldScanTimeout = setTimeout(() => {
          scanPageContent();
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Setup message listener for communication with background script
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'checkPage') {
        scanPageContent();
        sendResponse({ status: 'checked' });
      } else if (message.action === 'updateSettings') {
        config = { ...config, ...message.settings };
        sendResponse({ status: 'updated' });
      } else if (message.action === 'getPageInfo') {
        sendResponse({
          url: window.location.href,
          title: document.title,
          blocked: isBlocked
        });
      }
      return true;
    });
  }

  // Log blocked content
  function logBlock(type, details) {
    chrome.runtime.sendMessage({
      action: 'logBlock',
      data: {
        type: type,
        details: details,
        url: window.location.href,
        timestamp: Date.now()
      }
    }).catch(err => {
      // Extension context may be invalidated, ignore errors
    });
  }

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let needsRescan = false;

      for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key in config) {
          config[key] = newValue;
          needsRescan = true;
        }
      }

      if (needsRescan && config.enabled && !isBlocked) {
        scanPageContent();
      }
    }
  });

  // Start the content filter when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();