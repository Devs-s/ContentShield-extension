#!/usr/bin/env python3
"""
Content Shield AI Adult Content Detector
Uses machine learning to detect adult/pornographic content
"""

import json
import re
import pickle
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from collections import defaultdict

@dataclass
class DetectionResult:
    """Result of content detection"""
    is_adult: bool
    confidence: float
    category: str
    matched_keywords: List[str]
    risk_score: float
    message: str

class AdultContentDetector:
    """
    AI-powered adult content detector
    Learns from filter data and improves detection over time
    """
    
    def __init__(self, filters_path: str = None):
        self.filters_path = Path(filters_path) if filters_path else Path(__file__).parent.parent / 'filters'
        self.domains_data = {}
        self.keywords_data = {}
        self.category_weights = {}
        self.domain_patterns = []
        self.keyword_patterns = []
        self.trained = False
        
        # Detection thresholds
        self.confidence_threshold = 0.7
        self.high_risk_threshold = 0.85
        self.medium_risk_threshold = 0.5
        
        # Learning data
        self.learned_domains = set()
        self.learned_keywords = set()
        self.false_positives = set()
        
        # Initialize
        self._load_filters()
        self._build_patterns()
    
    def _load_filters(self) -> None:
        """Load domains and keywords from filters folder"""
        try:
            domains_file = self.filters_path / 'domains.json'
            with open(domains_file, 'r', encoding='utf-8') as f:
                self.domains_data = json.load(f)
                # Learn all domains
                if 'categories' in self.domains_data and 'adult' in self.domains_data['categories']:
                    self.learned_domains.update(self.domains_data['categories']['adult'])
        except Exception as e:
            print(f"Error loading domains: {e}")
        
        try:
            keywords_file = self.filters_path / 'keywords.json'
            with open(keywords_file, 'r', encoding='utf-8') as f:
                self.keywords_data = json.load(f)
                # Learn all keywords
                if 'categories' in self.keywords_data:
                    for category, keywords in self.keywords_data['categories'].items():
                        if isinstance(keywords, list):
                            self.learned_keywords.update(keywords)
        except Exception as e:
            print(f"Error loading keywords: {e}")
    
    def _build_patterns(self) -> None:
        """Build regex patterns from learned data"""
        # Domain patterns
        self.domain_patterns = []
        for domain in self.learned_domains:
            # Create pattern that matches domain and subdomains
            pattern = re.escape(domain).replace(r'\.', r'\.')
            self.domain_patterns.append(re.compile(pattern, re.IGNORECASE))
        
        # Keyword patterns
        self.keyword_patterns = []
        for keyword in self.learned_keywords:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            self.keyword_patterns.append(re.compile(pattern, re.IGNORECASE))
        
        # Category weights for scoring
        self.category_weights = {
            'adult_general': 1.0,
            'adult_specific': 1.5,
            'gambling': 0.8,
            'violence': 0.6,
            'drugs': 0.7
        }
    
    def analyze_url(self, url: str) -> DetectionResult:
        """
        Analyze a URL for adult content
        Returns DetectionResult with confidence and category
        """
        url_lower = url.lower()
        matched_keywords = []
        risk_score = 0.0
        category_scores = defaultdict(float)
        
        # Check domain patterns
        domain_match = False
        for pattern in self.domain_patterns:
            if pattern.search(url_lower):
                domain_match = True
                risk_score += 0.5
                break
        
        # Check keyword patterns
        for pattern in self.keyword_patterns:
            match = pattern.search(url_lower)
            if match:
                keyword = match.group().lower()
                matched_keywords.append(keyword)
                
                # Calculate category score
                for cat, keywords in self.keywords_data.get('categories', {}).items():
                    if keyword in [k.lower() for k in keywords]:
                        weight = self.category_weights.get(cat, 1.0)
                        category_scores[cat] += weight
        
        # Calculate confidence based on matches
        confidence = self._calculate_confidence(url_lower, domain_match, matched_keywords, category_scores)
        
        # Determine if adult content
        is_adult = confidence >= self.confidence_threshold
        
        # Determine category
        primary_category = self._determine_category(category_scores)
        
        # Generate message
        message = self._generate_message(is_adult, confidence, matched_keywords)
        
        return DetectionResult(
            is_adult=is_adult,
            confidence=confidence,
            category=primary_category,
            matched_keywords=list(set(matched_keywords)),
            risk_score=risk_score,
            message=message
        )
    
    def _calculate_confidence(self, url: str, domain_match: bool, 
                             keywords: List[str], category_scores: Dict) -> float:
        """Calculate confidence score"""
        score = 0.0
        
        # Domain match gives high confidence
        if domain_match:
            score += 0.6
        
        # Keyword matches
        score += min(len(keywords) * 0.15, 0.3)
        
        # Category scores
        if category_scores:
            max_cat_score = max(category_scores.values())
            score += min(max_cat_score * 0.2, 0.2)
        
        # URL structure analysis
        if self._has_suspicious_structure(url):
            score += 0.1
        
        return min(score, 1.0)
    
    def _has_suspicious_structure(self, url: str) -> bool:
        """Check for suspicious URL structures"""
        suspicious = [
            r'/\d{3,}/',  # Numeric paths (often galleries)
            r'/(img|pic|image|thumb|gallery)s?/\d+',
            r'[?&](id|page|cat|tag)=[^&]*(?:adult|xxx|porn)',
            r'/videos?/\d+',
            r'/(model|cam|chat)s?/\d+'
        ]
        
        for pattern in suspicious:
            if re.search(pattern, url, re.IGNORECASE):
                return True
        return False
    
    def _determine_category(self, category_scores: Dict) -> str:
        """Determine primary category from scores"""
        if not category_scores:
            return 'unknown'
        
        return max(category_scores.items(), key=lambda x: x[1])[0]
    
    def _generate_message(self, is_adult: bool, confidence: float, keywords: List[str]) -> str:
        """Generate appropriate message for detection result"""
        if not is_adult:
            return "Content appears safe"
        
        if confidence >= self.high_risk_threshold:
            return f"🚫 BAD BOY! Adult content blocked! High confidence: {confidence:.1%}"
        elif confidence >= self.medium_risk_threshold:
            return f"⚠️ BAD BOY! Suspicious content detected! Confidence: {confidence:.1%}"
        else:
            return f"⚠️ Potentially inappropriate content. Confidence: {confidence:.1%}"
    
    def learn_from_block(self, url: str, confirmed_adult: bool = True) -> None:
        """
        Learn from a blocked site to improve detection
        """
        if confirmed_adult:
            domain = self._extract_domain(url)
            if domain and domain not in self.false_positives:
                self.learned_domains.add(domain)
                # Rebuild patterns with new domain
                self._build_patterns()
                self.trained = True
    
    def report_false_positive(self, url: str) -> None:
        """Report a false positive to improve accuracy"""
        domain = self._extract_domain(url)
        if domain:
            self.false_positives.add(domain)
            if domain in self.learned_domains:
                self.learned_domains.discard(domain)
                self._build_patterns()
    
    def _extract_domain(self, url: str) -> Optional[str]:
        """Extract domain from URL"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc.lower()
        except:
            return None
    
    def save_model(self, filepath: str) -> None:
        """Save trained model to file"""
        model_data = {
            'learned_domains': list(self.learned_domains),
            'learned_keywords': list(self.learned_keywords),
            'false_positives': list(self.false_positives),
            'trained': self.trained,
            'version': '2.0.0-ai'
        }
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
    
    def load_model(self, filepath: str) -> bool:
        """Load trained model from file"""
        try:
            with open(filepath, 'rb') as f:
                model_data = pickle.load(f)
            
            self.learned_domains = set(model_data.get('learned_domains', []))
            self.learned_keywords = set(model_data.get('learned_keywords', []))
            self.false_positives = set(model_data.get('false_positives', []))
            self.trained = model_data.get('trained', False)
            
            self._build_patterns()
            return True
        except Exception as e:
            print(f"Error loading model: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Get detector statistics"""
        return {
            'learned_domains': len(self.learned_domains),
            'learned_keywords': len(self.learned_keywords),
            'false_positives_tracked': len(self.false_positives),
            'domain_patterns': len(self.domain_patterns),
            'keyword_patterns': len(self.keyword_patterns),
            'trained': self.trained,
            'confidence_threshold': self.confidence_threshold
        }


if __name__ == '__main__':
    # Test the detector
    detector = AdultContentDetector()
    
    print("="*60)
    print("Content Shield AI Detector - Test Mode")
    print("="*60)
    print(f"Stats: {detector.get_stats()}")
    print("="*60)
    
    test_urls = [
        "https://example.com",
        "https://pornhub.com",
        "https://safe-site.org/education",
        "https://xxx-site.net/gallery/123",
    ]
    
    for url in test_urls:
        result = detector.analyze_url(url)
        print(f"\nURL: {url}")
        print(f"  Adult: {result.is_adult}")
        print(f"  Confidence: {result.confidence:.2%}")
        print(f"  Category: {result.category}")
        print(f"  Message: {result.message}")
        print(f"  Keywords: {result.matched_keywords}")
