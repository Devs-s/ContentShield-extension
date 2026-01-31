# Content Shield Extension

A powerful cross-browser adult content blocker that protects your browsing experience by blocking inappropriate websites and content.

## Features

- **Cross-Browser Support**: Works on Chrome, Firefox, Edge, and Safari
- **Domain Blocking**: Block specific domains and subdomains
- **Keyword Filtering**: Block content based on keywords
- **Whitelist Support**: Allow specific domains while blocking others
- **Real-time Blocking**: Instant blocking of inappropriate content
- **Statistics**: Track blocked sites and viewing statistics
- **Password Protection**: Optional password protection for settings
- **Customizable**: Flexible blocking rules and settings

## Supported Browsers

- ✅ **Chrome/Chromium** (Manifest V3)
- ✅ **Firefox** (Manifest V2) 
- ✅ **Microsoft Edge** (Manifest V3)
- ✅ **Safari** (Manifest V2)

## Quick Installation

### Chrome/Edge
1. Download the latest release
2. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

### Firefox
1. Download the latest release
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `manifest-firefox.json` from the extension folder

### Safari
1. Download the latest release
2. Use Xcode to convert and build the Safari extension
3. Install through Safari Extensions preferences

## Distribution

This extension is distributed through official browser extension stores:

- **Chrome Web Store**: [Install from Chrome Web Store]
- **Firefox Add-ons**: [Install from Firefox Add-ons]
- **Microsoft Edge Add-ons**: [Install from Edge Add-ons]
- **Safari App Store**: [Install from Safari App Store]

## Development Setup

### Prerequisites
- Node.js (for development tools)
- Git

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/ContentShield-extension.git
   cd ContentShield-extension
   ```

2. Load for testing:
   
   **Chrome/Edge:**
   - Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension folder

   **Firefox:**
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox" → "Load Temporary Add-on"
   - Select `manifest-firefox.json` from the extension folder

   **Safari:**
   - Use Xcode to convert and build the Safari extension
   - Install through Safari Extensions preferences

## Configuration

### Basic Settings
- **Enable/Disable**: Turn protection on or off
- **Blocking Level**: Choose from strict, moderate, or relaxed
- **Custom Domains**: Add specific domains to block
- **Keywords**: Add keywords to filter content
- **Whitelist**: Allow specific domains

### Advanced Settings
- **Password Protection**: Secure settings with a password
- **Statistics**: Track blocking statistics and history
- **Home Page**: Set custom redirect page for blocked content

## Browser Compatibility

| Feature | Chrome | Firefox | Edge | Safari |
|---------|--------|---------|------|--------|
| Domain Blocking | ✅ | ✅ | ✅ | ✅ |
| Keyword Filtering | ✅ | ✅ | ✅ | ✅ |
| Real-time Blocking | ✅ | ✅ | ✅ | ✅ |
| Statistics | ✅ | ✅ | ✅ | ✅ |
| Password Protection | ✅ | ✅ | ✅ | ✅ |

## Development

### Project Structure
```
ContentShield-extension/
├── manifest.json              # Chrome/Edge (V3)
├── manifest-firefox.json      # Firefox (V2)
├── manifest-safari.json       # Safari (V2)
├── manifest-edge.json         # Edge (V3)
├── browser-polyfill.js         # Cross-browser compatibility
├── background.js               # Background script
├── content.js                  # Content script
├── popup.html/js/css           # Extension popup
├── options.html/js/css         # Options page
├── blocked.html/js/css         # Block page
├── utils.js                    # Utility functions
├── rules.json                  # Blocking rules
└── filters/                    # Filter lists
    ├── domains.json
    └── keywords.json
```

### Browser-Specific Manifests
- `manifest.json` - Chrome/Edge (Manifest V3)
- `manifest-firefox.json` - Firefox (Manifest V2)
- `manifest-safari.json` - Safari (Manifest V2)
- `manifest-edge.json` - Edge (Manifest V3)

Each manifest is optimized for its target browser's requirements and API support.

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test across all supported browsers
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests:
- Create an issue on GitHub
- Check browser-specific documentation:
  - [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
  - [Firefox Add-on Documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
  - [Edge Extension Documentation](https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/)
  - [Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari_web_extensions)

## Privacy

Content Shield does not collect or transmit any personal data. All blocking rules and settings are stored locally on your device.

---

**Note**: This extension is designed to help users protect themselves from inappropriate content. Please use responsibly and ensure it aligns with your local laws and regulations.
