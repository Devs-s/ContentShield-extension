// Content Shield - Enhanced Content Script with AI
// Advanced DOM scanning and content filtering with image analysis
// AI-powered "Bad Boy" detection system

(function() {
  'use strict';

  // Enhanced Configuration with AI
  let config = {
    enabled: true,
    strictMode: true,
    blockingLevel: 'strict',
    blockImages: true,
    blockVideos: true,
    blockIframes: true,
    blockCanvas: true,
    enableImageAnalysis: true,
    enableTextAnalysis: true,
    enableLinkScanning: true,
    enableAI: true, // AI detection enabled
    showBadBoyPopup: true, // Show dramatic popup
    customDomains: [],
    customKeywords: [],
    whitelistedDomains: [],
    temporarilyWhitelisted: [],
    aiSensitivity: 0.7, // 0.0 to 1.0
    badBoyThreshold: 0.7 // Confidence threshold for "Bad Boy" alert
  };

  // Enhanced keyword patterns for better detection
  const CONTENT_PATTERNS = {
    highRisk: [
      /porn/i, /xxx/i, /adult.*content/i, /sex.*cam/i, /live.*sex/i, /nude.*pics/i,
      /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i, /tube8/i,
      /onlyfans/i, /fansly/i, /manyvids/i, /chaturbate/i, /stripchat/i,
      /hentai/i, /rule34/i, /gelbooru/i, /e621/i, /fakku/i, /doujin/i
    ],
    mediumRisk: [
      /adult/i, /sexy/i, /nude/i, /naked/i, /erotic/i, /cam.*girl/i, /webcam/i,
      /escort/i, /hookup/i, /dating.*site/i, /sugar.*daddy/i, /sugar.*baby/i,
      /milf/i, /bbw/i, /amateur/i, /homemade.*video/i, /private.*show/i
    ],
    lowRisk: [
      /mature.*content/i, /18\+/i, /nsfw/i, /not.*safe.*work/i, /explicit/i,
      /sensual/i, /intimate/i, /lingerie/i, /bikini/i, /swimsuit/i
    ],
    imageIndicators: [
      /porn/i, /xxx/i, /sex/i, /nude/i, /naked/i, /adult/i, /erotic/i, /cam/i,
      /onlyfans/i, /fansly/i, /stripchat/i, /chaturbate/i, /myfreecams/i
    ]
  };

  // State management
  let isBlocked = false;
  let observer = null;
  let scanQueue = [];
  let processedElements = new WeakSet();
  let blockedElements = new Set();
  let currentDomain = window.location.hostname.toLowerCase();

  // Enhanced initialization
  async function init() {
    try {
      // Load settings from storage
      const settings = await chrome.storage.local.get([
        'enabled',
        'strictMode',
        'blockingLevel',
        'blockImages',
        'blockVideos',
        'blockIframes',
        'enableImageAnalysis',
        'enableTextAnalysis',
        'enableLinkScanning',
        'customDomains',
        'customKeywords',
        'whitelistedDomains',
        'temporarilyWhitelisted',
        'aiSensitivity'
      ]);

      config = { ...config, ...settings };

      // Set strict mode based on blocking level
      if (config.blockingLevel === 'strict') {
        config.strictMode = true;
        config.aiSensitivity = 0.5; // More sensitive
      } else if (config.blockingLevel === 'mild') {
        config.strictMode = false;
        config.aiSensitivity = 0.8; // Less sensitive
      }

      // Ensure arrays are defined
      config.customDomains = settings.customDomains || [];
      config.customKeywords = settings.customKeywords || [];
      config.whitelistedDomains = settings.whitelistedDomains || [];
      config.temporarilyWhitelisted = settings.temporarilyWhitelisted || [];

      // Check if filtering is enabled
      if (!config.enabled) {
        console.log('Content Shield: Filtering disabled');
        return;
      }

      // Check whitelist status
      if (isWhitelisted()) {
        console.log('Content Shield: Domain whitelisted');
        return;
      }

      // Check for temporary whitelist
      const now = Date.now();
      const tempWhitelisted = config.temporarilyWhitelisted.some(
        entry => entry.domain === currentDomain && (now - entry.timestamp < 30 * 60 * 1000)
      );
      if (tempWhitelisted) {
        console.log('Content Shield: Domain temporarily whitelisted');
        return;
      }

      // Check if URL should be blocked immediately
      if (await shouldBlockURL()) {
        blockPage();
        return;
      }

      // Perform initial content scan
      await performDeepContentScan();

      // Set up mutation observer for dynamic content
      observePageChanges();

      // Listen for messages
      setupMessageListener();

      // Set up periodic re-scan
      setInterval(() => {
        if (!isBlocked && config.enabled) {
          performQuickScan();
        }
      }, 5000);

    } catch (error) {
      console.error('Content Shield initialization error:', error);
    }
  }

  // Deep content scan - thorough initial scan
  async function performDeepContentScan() {
    if (isBlocked) return;

    try {
      // Scan text content
      if (config.enableTextAnalysis !== false) {
        scanTextContent();
      }

      // Scan images
      if (config.blockImages && config.enableImageAnalysis !== false) {
        await scanImages();
      }

      // Scan videos
      if (config.blockVideos) {
        scanVideos();
      }

      // Scan iframes
      if (config.blockIframes) {
        scanIframes();
      }

      // Scan links
      if (config.enableLinkScanning !== false) {
        scanLinks();
      }

    } catch (error) {
      console.error('Deep content scan error:', error);
    }
  }

  // Quick scan for periodic checks
  function performQuickScan() {
    if (isBlocked) return;

    // Scan new images
    if (config.blockImages) {
      const newImages = document.querySelectorAll('img:not([data-cs-checked])');
      newImages.forEach(img => {
        img.setAttribute('data-cs-checked', 'true');
        analyzeImageElement(img);
      });
    }

    // Scan new links
    if (config.enableLinkScanning !== false) {
      const newLinks = document.querySelectorAll('a:not([data-cs-checked])');
      newLinks.forEach(link => {
        link.setAttribute('data-cs-checked', 'true');
        analyzeLinkElement(link);
      });
    }
  }

  // Check if current domain is whitelisted
  function isWhitelisted() {
    const hostname = window.location.hostname;
    return config.whitelistedDomains.some(domain => {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  }

  // Enhanced text content scanning
  function scanTextContent() {
    if (isBlocked) return;

    try {
      const title = document.title.toLowerCase();
      const metaDescription = getMetaDescription().toLowerCase();
      const urlText = window.location.href.toLowerCase();
      const h1Tags = Array.from(document.querySelectorAll('h1')).map(h => h.textContent.toLowerCase()).join(' ');

      // Calculate risk scores
      const contentToAnalyze = `${title} ${metaDescription} ${urlText} ${h1Tags}`;
      const riskScore = calculateRiskScore(contentToAnalyze);

      // Block based on risk level
      if (riskScore.highRisk >= 2 || riskScore.mediumRisk >= 5) {
        logBlock('text_content_risk', `high:${riskScore.highRisk}, medium:${riskScore.mediumRisk}`);
        blockPage();
        return;
      }

      // Check against custom keywords with context
      for (const keyword of config.customKeywords) {
        const keywordLower = keyword.toLowerCase();
        const occurrences = countOccurrences(contentToAnalyze, keywordLower);

        if (occurrences > 0) {
          // Check context to reduce false positives
          if (isSuspiciousContext(contentToAnalyze, keywordLower)) {
            logBlock('keyword_context', `${keyword} (x${occurrences})`);
            blockPage();
            return;
          }
        }
      }

    } catch (error) {
      console.error('Text content scan error:', error);
    }
  }

  // Calculate risk score based on content
  function calculateRiskScore(content) {
    const scores = { highRisk: 0, mediumRisk: 0, lowRisk: 0 };

    for (const pattern of CONTENT_PATTERNS.highRisk) {
      if (pattern.test(content)) scores.highRisk++;
    }
    for (const pattern of CONTENT_PATTERNS.mediumRisk) {
      if (pattern.test(content)) scores.mediumRisk++;
    }
    for (const pattern of CONTENT_PATTERNS.lowRisk) {
      if (pattern.test(content)) scores.lowRisk++;
    }

    return scores;
  }

  // Count occurrences of keyword
  function countOccurrences(text, keyword) {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  // Check if keyword appears in suspicious context
  function isSuspiciousContext(content, keyword) {
    const suspiciousContexts = ['video', 'pic', 'photo', 'image', 'gallery', 'movie', 'clip', 'stream', 'live', 'cam'];
    const contentWords = content.split(/\s+/);
    const keywordIndex = contentWords.findIndex(w => w.includes(keyword));

    if (keywordIndex === -1) return false;

    // Check surrounding words
    const contextWindow = 3;
    const start = Math.max(0, keywordIndex - contextWindow);
    const end = Math.min(contentWords.length, keywordIndex + contextWindow + 1);
    const surroundingWords = contentWords.slice(start, end).join(' ');

    return suspiciousContexts.some(ctx => surroundingWords.includes(ctx));
  }

  // Get meta description from page
  function getMetaDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');
    return metaDesc ? metaDesc.getAttribute('content') || '' : '';
  }

  // Enhanced image scanning
  async function scanImages() {
    const images = document.querySelectorAll('img');

    for (const img of images) {
      if (processedElements.has(img)) continue;
      processedElements.add(img);

      analyzeImageElement(img);
    }
  }

  // Analyze individual image element
  function analyzeImageElement(img) {
    const alt = (img.alt || '').toLowerCase();
    const src = (img.src || '').toLowerCase();
    const title = (img.title || '').toLowerCase();
    const dataSrc = (img.dataset.src || '').toLowerCase();

    const checkText = `${alt} ${src} ${title} ${dataSrc}`;

    // Mark as checked
    img.setAttribute('data-cs-checked', 'true');

    // Check for high-risk patterns
    for (const pattern of CONTENT_PATTERNS.highRisk) {
      if (pattern.test(checkText)) {
        blockMediaElement(img, 'high_risk_image');
        return;
      }
    }

    // Check for medium-risk patterns (only in strict mode)
    if (config.strictMode) {
      for (const pattern of CONTENT_PATTERNS.mediumRisk) {
        if (pattern.test(checkText)) {
          blockMediaElement(img, 'medium_risk_image');
          return;
        }
      }
    }

    // Check image URL structure for suspicious patterns
    if (isSuspiciousImageUrl(src)) {
      blockMediaElement(img, 'suspicious_image_url');
      return;
    }

    // Check for lazy-loaded images
    if (img.dataset.src) {
      analyzeImageElement({
        alt: img.alt,
        src: img.dataset.src,
        title: img.title,
        dataset: {}
      });
    }
  }

  // Check if image URL is suspicious
  function isSuspiciousImageUrl(url) {
    const suspiciousPatterns = [
      /cdn.*porn/i, /img.*xxx/i, /pic.*sex/i, /thumb.*adult/i,
      /gallery.*nude/i, /photo.*naked/i, /image.*erotic/i,
      /content.*cam/i, /media.*strip/i, /upload.*porn/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  // Block media element with overlay
  function blockMediaElement(element, reason) {
    if (blockedElements.has(element)) return;
    blockedElements.add(element);

    // Add blur
    element.style.filter = 'blur(25px) brightness(0.1)';
    element.style.pointerEvents = 'none';
    element.setAttribute('data-content-shield-blocked', reason);

    // Add overlay with warning
    const overlay = document.createElement('div');
    overlay.className = 'content-shield-overlay';
    overlay.innerHTML = `
      <div class="cs-warning">
        <span class="cs-icon">🛡️</span>
        <span class="cs-text">Content Blocked</span>
      </div>
    `;
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.7);
      color: white;
      font-size: 14px;
      z-index: 999999;
      pointer-events: none;
    `;

    // Position parent if needed
    const parent = element.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    parent.appendChild(overlay);

    // Log block
    logBlock('media_blocked', reason);
  }

  // Enhanced video scanning
  function scanVideos() {
    const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="dailymotion"]');

    videos.forEach(video => {
      if (processedElements.has(video)) return;
      processedElements.add(video);

      const src = (video.src || '').toLowerCase();
      const title = (video.title || '').toLowerCase();
      const dataSrc = (video.dataset.src || '').toLowerCase();
      const poster = (video.poster || '').toLowerCase();

      const checkText = `${src} ${title} ${dataSrc} ${poster}`;

      // Check for high-risk patterns
      for (const pattern of CONTENT_PATTERNS.highRisk) {
        if (pattern.test(checkText)) {
          blockMediaElement(video, 'high_risk_video');
          return;
        }
      }

      // Check for medium-risk patterns in strict mode
      if (config.strictMode) {
        for (const pattern of CONTENT_PATTERNS.mediumRisk) {
          if (pattern.test(checkText)) {
            blockMediaElement(video, 'medium_risk_video');
            return;
          }
        }
      }
    });
  }

  // Scan iframes for suspicious content
  function scanIframes() {
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach(iframe => {
      if (processedElements.has(iframe)) return;
      processedElements.add(iframe);

      const src = (iframe.src || '').toLowerCase();

      // Check iframe source URL
      for (const pattern of CONTENT_PATTERNS.highRisk) {
        if (pattern.test(src)) {
          blockMediaElement(iframe, 'suspicious_iframe');
          return;
        }
      }

      // Check for known adult embed domains
      const suspiciousDomains = [
        'pornhub.com', 'xvideos.com', 'xhamster.com', 'redtube.com',
        'youporn.com', 'tube8.com', 'spankbang.com', 'chaturbate.com',
        'stripchat.com', 'cam4.com', 'bongacams.com', 'livejasmin.com'
      ];

      if (suspiciousDomains.some(domain => src.includes(domain))) {
        blockMediaElement(iframe, 'adult_embed_domain');
      }
    });
  }

  // Scan links for suspicious destinations
  function scanLinks() {
    const links = document.querySelectorAll('a[href]');

    links.forEach(link => {
      if (processedElements.has(link)) return;
      processedElements.add(link);

      analyzeLinkElement(link);
    });
  }

  // Analyze individual link
  function analyzeLinkElement(link) {
    const href = (link.href || '').toLowerCase();
    const text = (link.textContent || '').toLowerCase();
    const title = (link.title || '').toLowerCase();

    const checkText = `${href} ${text} ${title}`;

    link.setAttribute('data-cs-checked', 'true');

    // Check for high-risk patterns
    for (const pattern of CONTENT_PATTERNS.highRisk) {
      if (pattern.test(checkText)) {
        // Block the link
        link.style.pointerEvents = 'none';
        link.style.opacity = '0.3';
        link.style.textDecoration = 'line-through';
        link.setAttribute('data-content-shield-blocked-link', 'true');

        // Add warning tooltip
        link.title = '⚠️ This link leads to blocked content';
        return;
      }
    }
  }

  // Legacy blur function for compatibility
  function blurElement(element) {
    blockMediaElement(element, 'legacy_blur');
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

  // ============================================
  // AI-Powered Detection and Bad Boy Popup
  // ============================================

  // AI-based URL analysis
  async function analyzeWithAI(url) {
    if (!config.enableAI) return { blocked: false, confidence: 0 };
    
    const urlLower = url.toLowerCase();
    let confidence = 0;
    let matchedKeywords = [];
    
    // Domain matching (high weight)
    for (const domain of config.customDomains) {
      if (urlLower.includes(domain.toLowerCase())) {
        confidence += 0.6;
        matchedKeywords.push(domain);
        break;
      }
    }
    
    // Keyword matching
    for (const keyword of config.customKeywords) {
      if (urlLower.includes(keyword.toLowerCase())) {
        confidence += 0.15;
        matchedKeywords.push(keyword);
      }
    }
    
    // Pattern matching for known adult sites
    const adultPatterns = [
      /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i,
      /tube8/i, /xnxx/i, /beeg/i, /spankbang/i, /chaturbate/i,
      /stripchat/i, /bongacams/i, /myfreecams/i, /livejasmin/i,
      /onlyfans/i, /fansly/i, /manyvids/i, /clips4sale/i,
      /hentai/i, /rule34/i, /gelbooru/i, /danbooru/i, /e621/i,
      /fakku/i, /doujins/i, /nhentai/i, /tsumino/i
    ];
    
    for (const pattern of adultPatterns) {
      if (pattern.test(urlLower)) {
        confidence += 0.5;
        matchedKeywords.push('adult_site');
        break;
      }
    }
    
    // Cap at 1.0
    confidence = Math.min(confidence, 1.0);
    
    return {
      blocked: confidence >= config.badBoyThreshold,
      confidence: confidence,
      matchedKeywords: [...new Set(matchedKeywords)]
    };
  }

  // Show Bad Boy popup
  function showBadBoyPopup(result) {
    if (!config.showBadBoyPopup) return;
    if (document.getElementById('content-shield-bad-boy-popup')) return;
    
    // Create popup element
    const popup = document.createElement('div');
    popup.id = 'content-shield-bad-boy-popup';
    popup.className = 'content-shield-bad-boy-overlay';
    
    if (result.confidence < 0.9) {
      popup.classList.add('medium-risk');
    }
    
    // Get bad boy count from storage
    chrome.storage.local.get(['badBoyCount']).then(({ badBoyCount = 0 }) => {
      const count = (badBoyCount || 0) + 1;
      chrome.storage.local.set({ badBoyCount: count });
      
      popup.innerHTML = `
        <div class="content-shield-bad-boy-particles">
          ${Array(15).fill(0).map(() => {
            const emojis = ['🚫', '🔞', '🛡️', '⚠️', '❌', '🔒'];
            return `<span class="content-shield-bad-boy-particle" style="
              left: ${Math.random() * 100}%; 
              animation-delay: ${Math.random() * 10}s;
              animation-duration: ${8 + Math.random() * 8}s;
            ">${emojis[Math.floor(Math.random() * emojis.length)]}</span>`;
          }).join('')}
        </div>
        <div class="content-shield-bad-boy-counter">🚫 Bad Boy Alert #${count}</div>
        <div class="content-shield-bad-boy-container">
          <span class="content-shield-bad-boy-icon">🚫</span>
          <h1 class="content-shield-bad-boy-title">BAD BOY!</h1>
          <p class="content-shield-bad-boy-subtitle">Adult Content Blocked</p>
          <div class="content-shield-bad-boy-shield">🛡️</div>
          <div class="content-shield-bad-boy-progress">
            <div class="content-shield-bad-boy-progress-bar" style="width: ${result.confidence * 100}%"></div>
          </div>
          <p class="content-shield-bad-boy-confidence">AI Confidence: ${(result.confidence * 100).toFixed(1)}%</p>
          <p class="content-shield-bad-boy-message">${result.message || 'This site has been identified as containing adult content.'}</p>
          <p style="font-size: 14px; color: #95a5a6; margin-top: 10px; word-break: break-all;">🔗 ${window.location.hostname}</p>
          <div class="content-shield-bad-boy-buttons">
            <button class="content-shield-bad-boy-btn content-shield-bad-boy-btn-go-back" onclick="history.back()">⬅️ Go Back</button>
            <button class="content-shield-bad-boy-btn content-shield-bad-boy-btn-close" onclick="document.getElementById('content-shield-bad-boy-popup').remove(); document.body.style.overflow='';">Close</button>
          </div>
          <p style="font-size: 12px; color: #7f8c8d; margin-top: 20px;">🧠 Protected by Content Shield AI</p>
        </div>
      `;
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      document.body.appendChild(popup);
      
      // Play sound
      playAlertSound();
      
      console.log('🔴 BAD BOY POPUP SHOWN:', result);
    });
  }

  // Play alert sound
  function playAlertSound() {
    try {
      const audio = new Audio();
      audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVanu87plHQUuh9Dz2YU2Bhxqv+zplkcODVGm5O+4ZSAEMYrO89GFNwYdcfDr4ZdJDAtPp+XysWUeBjiS1/LTgTUGG3Dw6uCXSQwMTKjl8blnHwU2kNbz1YU1Bxtw8Ongl0gMC1Ko5vK8aSAFNo/T89SFNwYdcfDr4phJDQxPqOXyxGUhBTeP0/LThjUGG3Dw6OGbSQ0MTqjl8sZmIAU2j9Pz1YU1Bxtw8OnhmUgNC1Ko5fLFZiAFN4/T89WFNQYbcPDp4plIDQtRqOXyxWYfBTeP0/LW';
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  // Enhanced block page function with AI
  async function blockPageWithAI() {
    if (isBlocked) return;
    isBlocked = true;
    
    // AI analysis
    const aiResult = await analyzeWithAI(window.location.href);
    
    if (aiResult.blocked && aiResult.confidence >= config.badBoyThreshold) {
      // Show dramatic Bad Boy popup
      showBadBoyPopup(aiResult);
      
      // Log the block
      logBlock('ai_blocked', `confidence:${aiResult.confidence}, keywords:${aiResult.matchedKeywords.join(',')}`);
    } else {
      // Regular block
      blockPage();
    }
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showBadBoyPopup') {
      showBadBoyPopup(message.notification);
      sendResponse({ shown: true });
    } else if (message.action === 'runAICheck') {
      analyzeWithAI(window.location.href).then(result => {
        sendResponse(result);
      });
      return true;
    }
  });

  // Start the content filter when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();