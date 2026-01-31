// Browser compatibility polyfills for Content Shield extension
// Provides unified API across Chrome, Firefox, Safari, and Edge

(function(global) {
    'use strict';

    // Detect browser type
    const isFirefox = typeof browser !== 'undefined';
    const isChrome = typeof chrome !== 'undefined' && !isFirefox;
    const isSafari = typeof safari !== 'undefined';
    const isEdge = typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo && 
                   browser.runtime.getBrowserInfo().then(info => info.name === 'Microsoft Edge');

    // Unified browser API
    const BrowserAPI = {
        // Storage API
        storage: {
            local: {
                get: function(keys, callback) {
                    const api = isFirefox ? browser.storage.local : chrome.storage.local;
                    if (callback) {
                        return api.get(keys, callback);
                    }
                    return new Promise((resolve) => {
                        api.get(keys, resolve);
                    });
                },
                set: function(items, callback) {
                    const api = isFirefox ? browser.storage.local : chrome.storage.local;
                    if (callback) {
                        return api.set(items, callback);
                    }
                    return new Promise((resolve) => {
                        api.set(items, resolve);
                    });
                },
                remove: function(keys, callback) {
                    const api = isFirefox ? browser.storage.local : chrome.storage.local;
                    if (callback) {
                        return api.remove(keys, callback);
                    }
                    return new Promise((resolve) => {
                        api.remove(keys, resolve);
                    });
                }
            }
        },

        // Tabs API
        tabs: {
            query: function(queryInfo, callback) {
                const api = isFirefox ? browser.tabs : chrome.tabs;
                if (callback) {
                    return api.query(queryInfo, callback);
                }
                return new Promise((resolve) => {
                    api.query(queryInfo, resolve);
                });
            },
            update: function(tabId, updateProperties, callback) {
                const api = isFirefox ? browser.tabs : chrome.tabs;
                if (callback) {
                    return api.update(tabId, updateProperties, callback);
                }
                return new Promise((resolve) => {
                    api.update(tabId, updateProperties, resolve);
                });
            },
            sendMessage: function(tabId, message, options, callback) {
                const api = isFirefox ? browser.tabs : chrome.tabs;
                if (callback) {
                    return api.sendMessage(tabId, message, options, callback);
                }
                return new Promise((resolve) => {
                    api.sendMessage(tabId, message, options, resolve);
                });
            }
        },

        // Runtime API
        runtime: {
            sendMessage: function(message, callback) {
                const api = isFirefox ? browser.runtime : chrome.runtime;
                if (callback) {
                    return api.sendMessage(message, callback);
                }
                return new Promise((resolve) => {
                    api.sendMessage(message, resolve);
                });
            },
            onMessage: {
                addListener: function(listener) {
                    const api = isFirefox ? browser.runtime : chrome.runtime;
                    return api.onMessage.addListener(listener);
                }
            },
            getURL: function(path) {
                const api = isFirefox ? browser.runtime : chrome.runtime;
                return api.getURL(path);
            },
            id: (isFirefox ? browser.runtime : chrome.runtime).id
        },

        // Web Navigation API
        webNavigation: {
            onBeforeNavigate: {
                addListener: function(listener) {
                    const api = isFirefox ? browser.webNavigation : chrome.webNavigation;
                    return api.onBeforeNavigate.addListener(listener);
                }
            },
            onCompleted: {
                addListener: function(listener) {
                    const api = isFirefox ? browser.webNavigation : chrome.webNavigation;
                    return api.onCompleted.addListener(listener);
                }
            }
        },

        // Declarative Net Request API (Chrome/Edge only)
        declarativeNetRequest: {
            getDynamicRules: function(callback) {
                if (isFirefox) {
                    // Firefox doesn't support declarativeNetRequest, return empty
                    if (callback) callback([]);
                    return Promise.resolve([]);
                }
                const api = chrome.declarativeNetRequest;
                if (callback) {
                    return api.getDynamicRules(callback);
                }
                return new Promise((resolve) => {
                    api.getDynamicRules(resolve);
                });
            },
            updateDynamicRules: function(options, callback) {
                if (isFirefox) {
                    // Firefox doesn't support declarativeNetRequest
                    if (callback) callback();
                    return Promise.resolve();
                }
                const api = chrome.declarativeNetRequest;
                if (callback) {
                    return api.updateDynamicRules(options, callback);
                }
                return new Promise((resolve) => {
                    api.updateDynamicRules(options, resolve);
                });
            }
        },

        // Web Request API (Firefox fallback)
        webRequest: {
            onBeforeRequest: {
                addListener: function(listener, filter, extraInfoSpec) {
                    const api = isFirefox ? browser.webRequest : chrome.webRequest;
                    return api.onBeforeRequest.addListener(listener, filter, extraInfoSpec);
                }
            }
        },

        // Alarms API
        alarms: {
            create: function(name, alarmInfo) {
                const api = isFirefox ? browser.alarms : chrome.alarms;
                return api.create(name, alarmInfo);
            },
            onAlarm: {
                addListener: function(listener) {
                    const api = isFirefox ? browser.alarms : chrome.alarms;
                    return api.onAlarm.addListener(listener);
                }
            }
        }
    };

    // Export to global scope
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BrowserAPI;
    } else {
        global.BrowserAPI = BrowserAPI;
        
        // Also provide browser/chrome compatibility
        if (isFirefox && typeof chrome === 'undefined') {
            global.chrome = BrowserAPI;
        } else if (isChrome && typeof browser === 'undefined') {
            global.browser = BrowserAPI;
        }
    }

})(typeof window !== 'undefined' ? window : this);
