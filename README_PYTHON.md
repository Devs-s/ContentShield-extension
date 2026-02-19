# Content Shield Extension - Python Scripts

This directory contains Python scripts for maintaining and updating the Content Shield browser extension.

## Files

### scraper.py
A web scraper that automatically finds and adds adult domains and keywords to the extension's filter lists.

**Features:**
- Scrapes domain blocklists from GitHub (StevenBlack hosts, AdGuard filters)
- Extracts adult-related keywords from Wikipedia and other sources
- Merges new data with existing filters while preserving custom entries
- Automatically categorizes keywords into appropriate groups
- Updates both `domains.json` and `keywords.json` files

**Usage:**
```bash
python scraper.py
```

### updater.py
An automatic updater that keeps the extension synchronized with its GitHub repository.

**Features:**
- Checks for new releases on GitHub
- Creates automatic backups before updating
- Downloads and applies updates while preserving local customizations
- Can update just the extension, just the filters, or both
- Supports multiple manifest files for different browsers

**Usage:**
```bash
# Full update (extension + filters)
python updater.py

# Update only extension
python updater.py --extension-only

# Update only filters (run scraper)
python updater.py --scraper-only

# Force update even if up to date
python updater.py --force

# Specify custom repository
python updater.py --repo https://api.github.com/repos/your-username/ContentShield-extension
```

### requirements.txt
Python dependencies required for the scripts.

**Installation:**
```bash
pip install -r requirements.txt
```

## Setup

1. Install Python 3.7 or higher
2. Install dependencies: `pip install -r requirements.txt`
3. Run the scraper to update filters: `python scraper.py`
4. Set up automatic updates: `python updater.py`

## Automation

You can set up automatic updates using cron (Linux/macOS) or Task Scheduler (Windows):

### Windows Task Scheduler
1. Open Task Scheduler
2. Create new task
3. Set trigger to run daily/weekly
4. Action: Start program
   - Program: `python`
   - Arguments: `updater.py`
   - Start in: `C:\ContentShield-extension`

### Linux/macOS Cron
```bash
# Edit crontab
crontab -e

# Add daily update at 2 AM
0 2 * * * cd /path/to/ContentShield-extension && python updater.py
```

## Notes

- The scraper respects rate limits and includes delays between requests
- All custom filter entries are preserved during updates
- Backups are created automatically before any update
- The updater preserves local files like custom filters and scripts
- Both scripts include comprehensive error handling and logging
