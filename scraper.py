#!/usr/bin/env python3
"""
Content Shield Filter Scraper
Scrapes the web for adult domains and keywords to update Content Shield extension filters
"""

import requests
import json
import re
import time
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from datetime import datetime
import os
from typing import Set, List, Dict

class FilterScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.found_domains = set()
        self.found_keywords = set()
        
    def scrape_domain_lists(self):
        """Scrape known adult domain blocklists"""
        sources = [
            'https://github.com/StevenBlack/hosts/blob/master/hosts',
            'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
            'https://github.com/AdguardTeam/AdguardFilters/blob/master/BaseFilter/sections/adservers.txt',
            'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt'
        ]
        
        for source in sources:
            try:
                print(f"Scraping {source}...")
                response = self.session.get(source, timeout=30)
                response.raise_for_status()
                
                content = response.text
                domains = self.extract_domains_from_text(content)
                self.found_domains.update(domains)
                
                time.sleep(2)  # Rate limiting
                
            except Exception as e:
                print(f"Error scraping {source}: {e}")
    
    def extract_domains_from_text(self, text: str) -> Set[str]:
        """Extract domain names from text content"""
        domains = set()
        
        # Match common adult domain patterns
        adult_patterns = [
            r'\b(?:porn|xxx|sex|adult|nude|naked|erotic|cam|escort|dating|hookup)\w*\.[a-zA-Z]{2,}\b',
            r'\b[a-zA-Z0-9-]*\.(?:porn|xxx|sex|adult|nude|cam|escort|dating|hookup)\b',
            r'\b[a-zA-Z0-9-]*(?:tube|video|movie|pic|gallery|chat|live|webcam|show)\w*\.[a-zA-Z]{2,}\b'
        ]
        
        # Extract domains from hosts file format
        hosts_pattern = r'^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
        for match in re.finditer(hosts_pattern, text, re.MULTILINE):
            domain = match.group(1).lower()
            if self.is_adult_domain(domain):
                domains.add(domain)
        
        # Extract domains using adult patterns
        for pattern in adult_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                domain = match.group(0).lower()
                if self.is_valid_domain(domain):
                    domains.add(domain)
        
        return domains
    
    def is_adult_domain(self, domain: str) -> bool:
        """Check if domain appears to be adult-related"""
        adult_keywords = [
            'porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'erotic', 'cam', 'escort',
            'dating', 'hookup', 'tube', 'video', 'movie', 'pic', 'gallery', 'chat',
            'live', 'webcam', 'show', 'strip', 'teen', 'mature', 'milf', 'hentai',
            'anime', 'cartoon', 'toon', 'gay', 'lesbian', 'bdsm', 'fetish', 'kink'
        ]
        
        domain_lower = domain.lower()
        return any(keyword in domain_lower for keyword in adult_keywords)
    
    def is_valid_domain(self, domain: str) -> bool:
        """Validate domain format"""
        domain_pattern = r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(domain_pattern, domain)) and len(domain) > 3
    
    def scrape_keywords_from_content(self):
        """Scrape adult-related keywords from various sources"""
        sources = [
            'https://en.wikipedia.org/wiki/Pornography',
            'https://en.wikipedia.org/wiki/Adult_entertainment',
            'https://en.wikipedia.org/wiki/Sex_industry'
        ]
        
        for source in sources:
            try:
                print(f"Scraping keywords from {source}...")
                response = self.session.get(source, timeout=30)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract text from main content
                content_text = soup.get_text()
                keywords = self.extract_keywords_from_text(content_text)
                self.found_keywords.update(keywords)
                
                time.sleep(2)  # Rate limiting
                
            except Exception as e:
                print(f"Error scraping keywords from {source}: {e}")
    
    def extract_keywords_from_text(self, text: str) -> Set[str]:
        """Extract adult-related keywords from text"""
        keywords = set()
        
        # Common adult terms to look for
        adult_terms = [
            'pornography', 'porn', 'adult', 'sexual', 'erotic', 'nude', 'naked',
            'explicit', 'mature', 'xxx', 'sex', 'sexy', 'intimate', 'sensual',
            'fetish', 'kink', 'bdsm', 'bondage', 'dominant', 'submissive',
            'escort', 'prostitution', 'brothel', 'massage', 'parlor',
            'camgirl', 'webcam', 'stripper', 'exotic', 'dancer',
            'hentai', 'anime', 'cartoon', 'toon', 'manga', 'doujin',
            'dating', 'hookup', 'casual', 'encounter', 'affair',
            'viagra', 'cialis', 'enhancement', 'enlargement', 'libido',
            'orgasm', 'climax', 'masturbation', 'stimulation',
            'vibrator', 'dildo', 'toy', 'lubricant', 'condom'
        ]
        
        text_lower = text.lower()
        
        # Find keywords in text
        for term in adult_terms:
            if term in text_lower:
                keywords.add(term)
        
        # Extract multi-word phrases
        phrase_patterns = [
            r'\badult entertainment\b',
            r'\badult industry\b',
            r'\bsex industry\b',
            r'\bpornographic material\b',
            r'\bsexually explicit\b',
            r'\badult content\b',
            r'\bmature content\b',
            r'\bexplicit content\b',
            r'\bsexual content\b',
            r'\berotic content\b',
            r'\badult film\b',
            r'\badult video\b',
            r'\bsex toy\b',
            r'\badult toy\b',
            r'\bcam girl\b',
            r'\bweb cam\b',
            r'\blive cam\b',
            r'\bdating site\b',
            r'\bhookup site\b',
            r'\bcasual dating\b'
        ]
        
        for pattern in phrase_patterns:
            matches = re.findall(pattern, text_lower)
            keywords.update(matches)
        
        return keywords
    
    def load_existing_filters(self) -> Dict:
        """Load existing filter data"""
        filters_dir = os.path.join(os.path.dirname(__file__), 'filters')
        
        domains_file = os.path.join(filters_dir, 'domains.json')
        keywords_file = os.path.join(filters_dir, 'keywords.json')
        
        existing_data = {
            'domains': {'categories': {'adult': []}},
            'keywords': {'categories': {}}
        }
        
        try:
            with open(domains_file, 'r', encoding='utf-8') as f:
                existing_data['domains'] = json.load(f)
        except FileNotFoundError:
            print(f"Warning: {domains_file} not found")
        
        try:
            with open(keywords_file, 'r', encoding='utf-8') as f:
                existing_data['keywords'] = json.load(f)
        except FileNotFoundError:
            print(f"Warning: {keywords_file} not found")
        
        return existing_data
    
    def merge_with_existing(self, existing_data: Dict):
        """Merge scraped data with existing filters"""
        # Merge domains
        existing_adult_domains = set(existing_data['domains'].get('categories', {}).get('adult', []))
        merged_domains = existing_adult_domains.union(self.found_domains)
        
        # Merge keywords
        existing_keywords = set()
        for category_keywords in existing_data['keywords'].get('categories', {}).values():
            existing_keywords.update(category_keywords)
        
        merged_keywords = existing_keywords.union(self.found_keywords)
        
        return merged_domains, merged_keywords
    
    def update_filters(self):
        """Update filter files with scraped data"""
        print("Starting filter update process...")
        
        # Scrape for new data
        self.scrape_domain_lists()
        self.scrape_keywords_from_content()
        
        print(f"Found {len(self.found_domains)} new domains")
        print(f"Found {len(self.found_keywords)} new keywords")
        
        # Load existing data
        existing_data = self.load_existing_filters()
        
        # Merge data
        merged_domains, merged_keywords = self.merge_with_existing(existing_data)
        
        print(f"Total domains after merge: {len(merged_domains)}")
        print(f"Total keywords after merge: {len(merged_keywords)}")
        
        # Update domains.json
        self.update_domains_file(merged_domains)
        
        # Update keywords.json
        self.update_keywords_file(merged_keywords)
        
        print("Filter update completed!")
    
    def update_domains_file(self, domains: Set[str]):
        """Update domains.json file"""
        domains_file = os.path.join(os.path.dirname(__file__), 'filters', 'domains.json')
        
        # Load existing structure
        try:
            with open(domains_file, 'r', encoding='utf-8') as f:
                domains_data = json.load(f)
        except FileNotFoundError:
            domains_data = {
                "version": "1.0.0",
                "description": "Blocked domains list for Content Shield extension",
                "categories": {},
                "notes": []
            }
        
        # Update data
        domains_data['version'] = "1.0.0"
        domains_data['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
        domains_data['categories']['adult'] = sorted(list(domains))
        domains_data['totalDomains'] = len(domains)
        
        # Ensure other categories are preserved
        if 'violence' not in domains_data['categories']:
            domains_data['categories']['violence'] = []
        if 'malware' not in domains_data['categories']:
            domains_data['categories']['malware'] = []
        if 'extremism' not in domains_data['categories']:
            domains_data['categories']['extremism'] = []
        
        # Save updated file
        with open(domains_file, 'w', encoding='utf-8') as f:
            json.dump(domains_data, f, indent=2, ensure_ascii=False)
        
        print(f"Updated {domains_file} with {len(domains)} domains")
    
    def update_keywords_file(self, keywords: Set[str]):
        """Update keywords.json file"""
        keywords_file = os.path.join(os.path.dirname(__file__), 'filters', 'keywords.json')
        
        # Load existing structure
        try:
            with open(keywords_file, 'r', encoding='utf-8') as f:
                keywords_data = json.load(f)
        except FileNotFoundError:
            keywords_data = {
                "version": "1.0.0",
                "description": "Keyword blocklist for Content Shield extension",
                "categories": {},
                "matchingRules": {
                    "caseSensitive": False,
                    "wholeWord": True,
                    "contextAware": True
                },
                "excludeContexts": ["medical", "educational", "news", "legal", "academic"],
                "notes": []
            }
        
        # Categorize keywords
        categorized_keywords = self.categorize_keywords(keywords)
        
        # Update data
        keywords_data['version'] = "1.0.0"
        keywords_data['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
        keywords_data['categories'] = categorized_keywords
        keywords_data['totalKeywords'] = len(keywords)
        
        # Save updated file
        with open(keywords_file, 'w', encoding='utf-8') as f:
            json.dump(keywords_data, f, indent=2, ensure_ascii=False)
        
        print(f"Updated {keywords_file} with {len(keywords)} keywords")
    
    def categorize_keywords(self, keywords: Set[str]) -> Dict[str, List[str]]:
        """Categorize keywords into appropriate groups"""
        categories = {
            'adult_general': [],
            'adult_specific': [],
            'adult_acts': [],
            'body_parts': [],
            'adult_terms': [],
            'adult_industry': [],
            'dating_adult': [],
            'gambling': [],
            'drugs_illegal': [],
            'drugs_cannabis': [],
            'violence': [],
            'weapons': [],
            'extremism': [],
            'hacking': [],
            'piracy': [],
            'scams': [],
            'selfharm': [],
            'shock_content': [],
            'hentai_anime': [],
            'adult_services': [],
            'darkweb': [],
            'explicit_slang': [],
            'inappropriate_requests': [],
            'body_shaming': [],
            'harassment': [],
            'minors_exploitation': []
        }
        
        # Category keyword mappings
        category_mappings = {
            'adult_general': ['porn', 'porno', 'pornography', 'xxx', 'sex', 'sexy', 'nsfw', 'adult', 'mature', 'explicit', 'nude', 'naked', 'nudity', 'erotic', 'erotica'],
            'adult_specific': ['pornstar', 'camgirl', 'webcam', 'livecam', 'strip', 'stripper', 'escort', 'onlyfans'],
            'adult_acts': ['sexual', 'intercourse', 'intimacy', 'seduce', 'foreplay', 'orgy', 'fetish', 'kink', 'bdsm', 'bondage'],
            'body_parts': ['breast', 'boobs', 'tits', 'nipple', 'butt', 'ass', 'penis', 'vagina', 'genitals'],
            'adult_terms': ['viagra', 'cialis', 'enhancement', 'enlargement', 'libido', 'orgasm', 'masturbation', 'vibrator', 'dildo'],
            'adult_industry': ['onlyfans', 'fansly', 'patreon', 'cam site', 'porn site', 'adult entertainment'],
            'dating_adult': ['hookup', 'casual dating', 'nsa', 'friends with benefits', 'sugar daddy'],
            'gambling': ['casino', 'gambling', 'bet', 'poker', 'blackjack', 'roulette', 'lottery'],
            'drugs_illegal': ['cocaine', 'heroin', 'methamphetamine', 'lsd', 'ecstasy', 'fentanyl'],
            'drugs_cannabis': ['marijuana', 'cannabis', 'weed', 'pot', 'ganja', 'thc', 'cbd'],
            'violence': ['gore', 'violent', 'brutal', 'murder', 'kill', 'torture', 'blood'],
            'weapons': ['gun', 'firearm', 'weapon', 'rifle', 'shotgun', 'pistol', 'bomb'],
            'extremism': ['terrorism', 'terrorist', 'extremist', 'radical', 'jihad', 'nazi'],
            'hacking': ['hack', 'hacking', 'exploit', 'malware', 'virus', 'phishing'],
            'piracy': ['pirate', 'torrent', 'crack', 'warez', 'bootleg'],
            'scams': ['scam', 'fraud', 'phishing', 'ponzi scheme', 'get rich quick'],
            'selfharm': ['suicide', 'self harm', 'cutting', 'anorexia'],
            'shock_content': ['shock', 'disturbing', 'graphic', 'snuff', 'execution'],
            'hentai_anime': ['hentai', 'ecchi', 'yaoi', 'yuri', 'loli', 'doujin'],
            'adult_services': ['escort service', 'adult massage', 'erotic massage'],
            'darkweb': ['dark web', 'tor browser', 'onion site', 'black market'],
            'explicit_slang': ['bang', 'screw', 'shag', 'smash', 'get laid'],
            'inappropriate_requests': ['send nudes', 'rate me', 'dick pic'],
            'harassment': ['harass', 'stalk', 'cyberbully', 'dox', 'blackmail'],
            'minors_exploitation': ['child exploitation', 'pedophile', 'underage', 'jailbait']
        }
        
        # Categorize keywords
        for keyword in keywords:
            keyword_lower = keyword.lower()
            categorized = False
            
            for category, category_keywords in category_mappings.items():
                if any(cat_keyword in keyword_lower for cat_keyword in category_keywords):
                    categories[category].append(keyword)
                    categorized = True
                    break
            
            if not categorized:
                categories['adult_general'].append(keyword)
        
        # Sort and remove duplicates within categories
        for category in categories:
            categories[category] = sorted(list(set(categories[category])))
        
        return categories

def main():
    """Main function to run the scraper"""
    scraper = FilterScraper()
    scraper.update_filters()

if __name__ == "__main__":
    main()
