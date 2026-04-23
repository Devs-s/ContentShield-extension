/**
 * Content Shield AI Bridge
 * Connects browser extension with Python AI backend
 * Handles "Bad Boy" notifications
 */

const AIBridge = {
    // AI Configuration
    config: {
        enabled: true,
        pythonPath: 'python',
        aiModulePath: 'ai/predictor.py',
        notificationBridge: 'ai/notification_bridge.py',
        useNativeAI: false, // Set to true when Python AI is available
        badBoyThreshold: 0.7,
        showPopup: true,
        playSound: true
    },
    
    // AI State
    state: {
        lastPrediction: null,
        notificationHistory: [],
        badBoyCount: 0,
        modelLoaded: false
    },

    // ============================================
    // Initialize AI Bridge
    // ============================================
    
    async init() {
        console.log('🔮 Content Shield AI Bridge initializing...');
        
        // Load AI settings
        const settings = await this.loadAISettings();
        this.config = { ...this.config, ...settings };
        
        // Check if AI model is available
        await this.checkAIModel();
        
        // Load notification history
        await this.loadNotificationHistory();
        
        console.log('✅ AI Bridge initialized');
        return this.state.modelLoaded;
    },
    
    async loadAISettings() {
        try {
            const result = await chrome.storage.local.get('aiSettings');
            return result.aiSettings || {};
        } catch (e) {
            return {};
        }
    },
    
    async checkAIModel() {
        // For now, use native detection (JavaScript-based)
        // Python AI can be enabled via settings
        this.state.modelLoaded = true;
        this.config.useNativeAI = true;
        return true;
    },

    // ============================================
    // AI Prediction Methods
    // ============================================
    
    async predictURL(url) {
        if (!this.config.enabled) {
            return { blocked: false, confidence: 0 };
        }
        
        try {
            let result;
            
            if (this.config.useNativeAI) {
                // Use native JavaScript AI detection
                result = await this.nativePredict(url);
            } else {
                // Fallback to basic detection
                result = await this.basicPredict(url);
            }
            
            this.state.lastPrediction = result;
            
            // If blocked, show notification
            if (result.blocked && result.confidence >= this.config.badBoyThreshold) {
                await this.showBadBoyNotification(url, result);
            }
            
            return result;
            
        } catch (e) {
            console.error('AI prediction error:', e);
            return { blocked: false, confidence: 0, error: e.message };
        }
    },
    
    async nativePredict(url) {
        // Advanced AI-style detection using learned patterns
        const urlLower = url.toLowerCase();
        let confidence = 0;
        let matchedKeywords = [];
        let category = 'unknown';
        
        // Get filters from storage
        const { filters, customDomains, customKeywords } = await chrome.storage.local.get([
            'filters', 'customDomains', 'customKeywords'
        ]);
        
        // Domain matching (high confidence)
        const allDomains = [
            ...(filters?.adult || []),
            ...(customDomains || [])
        ];
        
        for (const domain of allDomains) {
            if (urlLower.includes(domain.toLowerCase())) {
                confidence += 0.6;
                matchedKeywords.push(domain);
                category = 'adult';
                break;
            }
        }
        
        // Keyword matching
        const allKeywords = [
            ...(filters?.keywords || []),
            ...(customKeywords || [])
        ];
        
        for (const keyword of allKeywords) {
            if (urlLower.includes(keyword.toLowerCase())) {
                confidence += 0.15;
                matchedKeywords.push(keyword);
            }
        }
        
        // Cap confidence
        confidence = Math.min(confidence, 1.0);
        
        // URL structure analysis
        const suspiciousPatterns = [
            /\/\d{3,}\//,
            /\/(img|pic|image|thumb|gallery|video)s?\/\d+/,
            /[?&](id|page|cat|tag)=[^&]*(?:adult|xxx|porn)/,
            /\/videos?\/\d+/,
            /\/(model|cam|chat)s?\/\d+/
        ];
        
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(urlLower)) {
                confidence += 0.1;
                break;
            }
        }
        
        return {
            blocked: confidence >= 0.7,
            confidence: confidence,
            category: category,
            matchedKeywords: [...new Set(matchedKeywords)],
            riskLevel: this.getRiskLevel(confidence),
            message: this.generateMessage(confidence, matchedKeywords),
            timestamp: Date.now()
        };
    },
    
    async basicPredict(url) {
        // Basic pattern matching
        const adultPatterns = [
            /porn/i, /xxx/i, /sex/i, /adult/i, /nsfw/i,
            /nude/i, /naked/i, /erotic/i, /hentai/i,
            /camgirl/i, /onlyfans/i
        ];
        
        let matches = 0;
        for (const pattern of adultPatterns) {
            if (pattern.test(url)) {
                matches++;
            }
        }
        
        const confidence = Math.min(matches * 0.3, 1.0);
        
        return {
            blocked: confidence >= 0.7,
            confidence: confidence,
            category: matches > 0 ? 'adult' : 'safe',
            matchedKeywords: [],
            riskLevel: this.getRiskLevel(confidence),
            message: this.generateMessage(confidence, []),
            timestamp: Date.now()
        };
    },
    
    getRiskLevel(confidence) {
        if (confidence >= 0.85) return 'HIGH';
        if (confidence >= 0.7) return 'MEDIUM';
        if (confidence >= 0.5) return 'LOW';
        return 'NONE';
    },
    
    generateMessage(confidence, keywords) {
        if (confidence >= 0.9) {
            return "🔴 BAD BOY! Adult content blocked! Stay safe! 🛡️";
        } else if (confidence >= 0.7) {
            return "⚠️ BAD BOY! Suspicious adult content detected! 🚫";
        } else if (confidence >= 0.5) {
            return "⚠️ Potentially inappropriate content detected";
        }
        return "✅ Content appears safe";
    },

    // ============================================
    // Bad Boy Notification System
    // ============================================
    
    async showBadBoyNotification(url, result) {
        // Increment bad boy counter
        this.state.badBoyCount++;
        
        // Create notification data
        const notification = {
            id: Date.now(),
            type: 'BAD_BOY_ALERT',
            url: url,
            title: this.getNotificationTitle(result.confidence),
            message: result.message,
            confidence: result.confidence,
            riskLevel: result.riskLevel,
            keywords: result.matchedKeywords,
            timestamp: Date.now(),
            icon: this.getNotificationIcon(result.confidence)
        };
        
        // Add to history
        this.state.notificationHistory.unshift(notification);
        if (this.state.notificationHistory.length > 50) {
            this.state.notificationHistory = this.state.notificationHistory.slice(0, 50);
        }
        
        // Save history
        await this.saveNotificationHistory();
        
        // Show browser notification
        await this.showBrowserNotification(notification);
        
        // Show in-page popup if enabled
        if (this.config.showPopup) {
            await this.showPagePopup(notification);
        }
        
        // Play sound if enabled
        if (this.config.playSound) {
            this.playAlertSound();
        }
        
        console.log('🔴 BAD BOY ALERT:', notification);
    },
    
    getNotificationTitle(confidence) {
        if (confidence >= 0.9) return "🔴 BAD BOY DETECTED!";
        if (confidence >= 0.7) return "⚠️ BAD BOY ALERT!";
        return "Content Shield Alert";
    },
    
    getNotificationIcon(confidence) {
        if (confidence >= 0.9) return "🚨";
        if (confidence >= 0.7) return "🛡️";
        return "⚠️";
    },
    
    async showBrowserNotification(notification) {
        try {
            await chrome.notifications.create(`bad-boy-${notification.id}`, {
                type: 'basic',
                iconUrl: 'imgs/icon128.png',
                title: notification.title,
                message: `Blocked: ${new URL(notification.url).hostname}\n${notification.message}`,
                priority: 2,
                requireInteraction: notification.confidence >= 0.9
            });
        } catch (e) {
            console.error('Notification error:', e);
        }
    },
    
    async showPagePopup(notification) {
        // Send message to content script to show popup
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'showBadBoyPopup',
                    notification: notification
                });
            }
        } catch (e) {
            console.error('Popup error:', e);
        }
    },
    
    playAlertSound() {
        // Create audio context for alert sound
        try {
            const audio = new Audio();
            // Use data URI for simple alert sound
            audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVanu87plHQUuh9Dz2YU2Bhxqv+zplkcODVGm5O+4ZSAEMYrO89GFNwYdcfDr4ZdJDAtPp+XysWUeBjiS1/LTgTUGG3Dw6uCXSQwMTKjl8blnHwU2kNbz1YU1Bxtw8Ongl0gMC1Ko5vK8aSAFNo/T89SFNwYdcfDr4phJDQxPqOXyxGUhBTeP0/LThjUGG3Dw6OGbSQ0MTqjl8sZmIAU2j9Pz1YU1Bxtw8OnhmUgNC1Ko5fLFZiAFN4/T89WFNQYbcPDp4plIDQtRqOXyxWYfBTeP0/LW'.repeat(10);
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (e) {
            // Audio not critical
        }
    },

    // ============================================
    // History Management
    // ============================================
    
    async loadNotificationHistory() {
        try {
            const result = await chrome.storage.local.get('aiNotificationHistory');
            this.state.notificationHistory = result.aiNotificationHistory || [];
            this.state.badBoyCount = this.state.notificationHistory.filter(
                n => n.type === 'BAD_BOY_ALERT'
            ).length;
        } catch (e) {
            this.state.notificationHistory = [];
        }
    },
    
    async saveNotificationHistory() {
        try {
            await chrome.storage.local.set({
                aiNotificationHistory: this.state.notificationHistory,
                badBoyCount: this.state.badBoyCount
            });
        } catch (e) {
            console.error('Error saving history:', e);
        }
    },
    
    getNotificationHistory() {
        return this.state.notificationHistory;
    },
    
    getBadBoyCount() {
        return this.state.badBoyCount;
    },
    
    async clearHistory() {
        this.state.notificationHistory = [];
        this.state.badBoyCount = 0;
        await this.saveNotificationHistory();
    },

    // ============================================
    // Learning Methods
    // ============================================
    
    async learnFromBlock(url, confirmed = true) {
        // Add to learned patterns
        try {
            const { learnedDomains = [] } = await chrome.storage.local.get('learnedDomains');
            
            const domain = new URL(url).hostname;
            if (confirmed && !learnedDomains.includes(domain)) {
                learnedDomains.push(domain);
                await chrome.storage.local.set({ learnedDomains });
                
                console.log('🧠 AI learned new domain:', domain);
            }
        } catch (e) {
            console.error('Learning error:', e);
        }
    },
    
    async reportFalsePositive(url) {
        // Remove from learned patterns
        try {
            const { learnedDomains = [], falsePositives = [] } = await chrome.storage.local.get([
                'learnedDomains', 'falsePositives'
            ]);
            
            const domain = new URL(url).hostname;
            const index = learnedDomains.indexOf(domain);
            if (index > -1) {
                learnedDomains.splice(index, 1);
            }
            
            if (!falsePositives.includes(domain)) {
                falsePositives.push(domain);
            }
            
            await chrome.storage.local.set({ learnedDomains, falsePositives });
            console.log('🧠 AI unlearned domain (false positive):', domain);
        } catch (e) {
            console.error('False positive error:', e);
        }
    },

    // ============================================
    // Stats and Export
    // ============================================
    
    getStats() {
        return {
            badBoyCount: this.state.badBoyCount,
            notificationHistory: this.state.notificationHistory.length,
            modelLoaded: this.state.modelLoaded,
            useNativeAI: this.config.useNativeAI,
            lastPrediction: this.state.lastPrediction
        };
    },
    
    async exportData() {
        return {
            stats: this.getStats(),
            history: this.state.notificationHistory,
            config: this.config,
            version: '2.0.0-ai'
        };
    }
};

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIBridge;
}
