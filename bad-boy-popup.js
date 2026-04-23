/**
 * Bad Boy Popup Script
 * Handles the visual "Bad Boy" notification popup
 * Shows when adult content is detected by AI
 */

const BadBoyPopup = {
    // State
    isShowing: false,
    currentNotification: null,
    popupElement: null,
    
    // Configuration
    config: {
        autoCloseDelay: 0, // 0 = don't auto close
        showCounter: true,
        playSound: true,
        animationEnabled: true
    },

    // ============================================
    // Initialize
    // ============================================
    
    init() {
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'showBadBoyPopup') {
                this.show(message.notification);
                sendResponse({ shown: true });
            } else if (message.action === 'hideBadBoyPopup') {
                this.hide();
                sendResponse({ hidden: true });
            }
            return true;
        });
        
        console.log('🔴 Bad Boy Popup initialized');
    },

    // ============================================
    // Show Popup
    // ============================================
    
    show(notification) {
        // Don't show multiple popups
        if (this.isShowing) {
            this.hide();
        }
        
        this.currentNotification = notification;
        this.isShowing = true;
        
        // Create popup HTML
        this.popupElement = this.createPopupElement(notification);
        
        // Add to page
        document.body.appendChild(this.popupElement);
        
        // Prevent scrolling on body
        document.body.style.overflow = 'hidden';
        
        // Add keyboard listener
        document.addEventListener('keydown', this.handleKeydown);
        
        // Play sound if enabled
        if (this.config.playSound) {
            this.playSound();
        }
        
        // Auto close if configured
        if (this.config.autoCloseDelay > 0) {
            setTimeout(() => this.hide(), this.config.autoCloseDelay);
        }
        
        console.log('🔴 Bad Boy Popup shown:', notification.message);
    },

    // ============================================
    // Create Popup Element
    // ============================================
    
    createPopupElement(notification) {
        const div = document.createElement('div');
        div.className = 'content-shield-bad-boy-overlay';
        div.id = 'content-shield-bad-boy-popup';
        
        // Add risk level class
        if (notification.confidence >= 0.9) {
            // Default high risk styling
        } else if (notification.confidence >= 0.7) {
            div.classList.add('medium-risk');
        }
        
        // Create particles background
        const particles = this.createParticles();
        
        // Get bad boy counter
        const counter = this.config.showCounter ? `
            <div class="content-shield-bad-boy-counter">
                🚫 Bad Boy Alert #${notification.badBoyCount || 1}
            </div>
        ` : '';
        
        // Build popup HTML
        div.innerHTML = `
            ${particles}
            ${counter}
            <div class="content-shield-bad-boy-container">
                <span class="content-shield-bad-boy-icon">🚫</span>
                <h1 class="content-shield-bad-boy-title">BAD BOY!</h1>
                <p class="content-shield-bad-boy-subtitle">Adult Content Blocked</p>
                
                <div class="content-shield-bad-boy-shield">🛡️</div>
                
                <div class="content-shield-bad-boy-progress">
                    <div class="content-shield-bad-boy-progress-bar" style="width: ${notification.confidence * 100}%"></div>
                </div>
                
                <p class="content-shield-bad-boy-confidence">
                    AI Confidence: ${(notification.confidence * 100).toFixed(1)}%
                </p>
                
                <p class="content-shield-bad-boy-message">
                    ${notification.message || 'This site has been identified as containing adult content.'}
                </p>
                
                <p class="content-shield-bad-boy-url" style="
                    font-size: 14px;
                    color: #95a5a6;
                    margin-top: 10px;
                    word-break: break-all;
                ">
                    🔗 ${this.truncateUrl(notification.url, 50)}
                </p>
                
                ${notification.keywords && notification.keywords.length > 0 ? `
                    <p style="font-size: 12px; color: #7f8c8d; margin-top: 10px;">
                        Matched: ${notification.keywords.slice(0, 5).join(', ')}
                    </p>
                ` : ''}
                
                <div class="content-shield-bad-boy-buttons">
                    <button class="content-shield-bad-boy-btn content-shield-bad-boy-btn-go-back" id="badBoyGoBack">
                        ⬅️ Go Back
                    </button>
                    <button class="content-shield-bad-boy-btn content-shield-bad-boy-btn-close" id="badBoyClose">
                        Close
                    </button>
                </div>
                
                <p style="font-size: 12px; color: #7f8c8d; margin-top: 20px;">
                    🧠 Protected by Content Shield AI
                </p>
            </div>
        `;
        
        // Add event listeners
        setTimeout(() => {
            const goBackBtn = div.querySelector('#badBoyGoBack');
            const closeBtn = div.querySelector('#badBoyClose');
            
            if (goBackBtn) {
                goBackBtn.addEventListener('click', () => {
                    this.handleGoBack();
                });
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.handleClose();
                });
            }
        }, 0);
        
        return div;
    },

    // ============================================
    // Create Floating Particles
    // ============================================
    
    createParticles() {
        const particles = document.createElement('div');
        particles.className = 'content-shield-bad-boy-particles';
        
        const emojis = ['🚫', '🔞', '🛡️', '⚠️', '❌', '🔒'];
        
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('span');
            particle.className = 'content-shield-bad-boy-particle';
            particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 10}s`;
            particle.style.animationDuration = `${10 + Math.random() * 10}s`;
            particles.appendChild(particle);
        }
        
        return particles.outerHTML;
    },

    // ============================================
    // Button Handlers
    // ============================================
    
    handleGoBack() {
        // Report to background
        chrome.runtime.sendMessage({
            action: 'badBoyGoBack',
            url: this.currentNotification?.url,
            timestamp: Date.now()
        });
        
        // Go back in history
        if (window.history.length > 1) {
            window.history.back();
        } else {
            // Redirect to safe page
            window.location.href = 'https://www.google.com';
        }
        
        this.hide();
    },
    
    handleClose() {
        // Report to background
        chrome.runtime.sendMessage({
            action: 'badBoyClosed',
            url: this.currentNotification?.url,
            timestamp: Date.now()
        });
        
        this.hide();
    },

    // ============================================
    // Hide Popup
    // ============================================
    
    hide() {
        if (!this.popupElement) return;
        
        // Add exit animation
        this.popupElement.style.animation = 'badBoySlideOut 0.3s ease-out';
        
        setTimeout(() => {
            if (this.popupElement && this.popupElement.parentNode) {
                this.popupElement.parentNode.removeChild(this.popupElement);
            }
            
            this.popupElement = null;
            this.isShowing = false;
            this.currentNotification = null;
            
            // Restore scrolling
            document.body.style.overflow = '';
            
            // Remove keyboard listener
            document.removeEventListener('keydown', this.handleKeydown);
        }, 300);
    },

    // ============================================
    // Keyboard Handler
    // ============================================
    
    handleKeydown(e) {
        if (e.key === 'Escape') {
            BadBoyPopup.hide();
        } else if (e.key === 'Backspace') {
            BadBoyPopup.handleGoBack();
        }
    },

    // ============================================
    // Sound Effect
    // ============================================
    
    playSound() {
        try {
            // Create a simple beep sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Alert sound pattern
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
            // Audio not critical
        }
    },

    // ============================================
    // Utility Functions
    // ============================================
    
    truncateUrl(url, maxLength) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    },

    // ============================================
    // Configuration
    // ============================================
    
    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
};

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => BadBoyPopup.init());
} else {
    BadBoyPopup.init();
}

// Make available globally
if (typeof window !== 'undefined') {
    window.BadBoyPopup = BadBoyPopup;
}
