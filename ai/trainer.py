#!/usr/bin/env python3
"""
Content Shield AI Model Trainer
Trains the AI model on filter data for better detection
"""

import json
import pickle
import random
from pathlib import Path
from typing import List, Dict, Tuple, Set
from collections import defaultdict
import re

class ModelTrainer:
    """
    Trains the AI model using filter data
    Implements incremental learning and model updates
    """
    
    def __init__(self, filters_path: str = None, model_path: str = None):
        self.filters_path = Path(filters_path) if filters_path else Path(__file__).parent.parent / 'filters'
        self.model_path = Path(model_path) if model_path else Path(__file__).parent / 'trained_model.pkl'
        
        # Training data
        self.training_domains: Set[str] = set()
        self.training_keywords: Set[str] = set()
        self.safe_domains: Set[str] = set()  # Known safe domains for negative training
        self.feature_vectors: List[Dict] = []
        
        # Model parameters
        self.domain_weights: Dict[str, float] = {}
        self.keyword_weights: Dict[str, float] = {}
        self.pattern_scores: Dict[str, float] = {}
        
        # Learning rate for incremental updates
        self.learning_rate = 0.1
        
    def load_training_data(self) -> Tuple[Set[str], Set[str]]:
        """Load domains and keywords from filters for training"""
        domains = set()
        keywords = set()
        
        # Load domains
        try:
            domains_file = self.filters_path / 'domains.json'
            with open(domains_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'categories' in data and 'adult' in data['categories']:
                    domains = set(data['categories']['adult'])
                    print(f"Loaded {len(domains)} adult domains for training")
        except Exception as e:
            print(f"Error loading domains: {e}")
        
        # Load keywords
        try:
            keywords_file = self.filters_path / 'keywords.json'
            with open(keywords_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'categories' in data:
                    for cat, words in data['categories'].items():
                        if isinstance(words, list):
                            keywords.update(words)
                    print(f"Loaded {len(keywords)} keywords for training")
        except Exception as e:
            print(f"Error loading keywords: {e}")
        
        self.training_domains = domains
        self.training_keywords = keywords
        
        return domains, keywords
    
    def load_safe_domains(self, safe_list_path: str = None) -> Set[str]:
        """Load list of known safe domains for negative examples"""
        safe_domains = {
            'google.com', 'youtube.com', 'facebook.com', 'amazon.com',
            'wikipedia.org', 'twitter.com', 'instagram.com', 'linkedin.com',
            'reddit.com', 'netflix.com', 'microsoft.com', 'apple.com',
            'github.com', 'stackoverflow.com', 'medium.com', 'quora.com'
        }
        
        if safe_list_path:
            try:
                with open(safe_list_path, 'r') as f:
                    additional = set(line.strip() for line in f if line.strip())
                    safe_domains.update(additional)
            except Exception as e:
                print(f"Error loading safe domains: {e}")
        
        self.safe_domains = safe_domains
        print(f"Loaded {len(safe_domains)} safe domains for negative training")
        return safe_domains
    
    def extract_features(self, url: str, is_adult: bool) -> Dict:
        """Extract feature vector from URL"""
        url_lower = url.lower()
        
        features = {
            'domain_score': 0.0,
            'keyword_score': 0.0,
            'path_score': 0.0,
            'tld_risk': 0.0,
            'numeric_in_domain': 0.0,
            'suspicious_patterns': 0.0,
            'is_adult': is_adult
        }
        
        # Check domain matches
        for domain in self.training_domains:
            if domain in url_lower:
                features['domain_score'] += 1.0
                break
        
        # Check keyword matches
        keyword_count = 0
        for keyword in self.training_keywords:
            if keyword.lower() in url_lower:
                keyword_count += 1
        features['keyword_score'] = min(keyword_count / 3, 1.0)  # Normalize
        
        # Path analysis
        path_patterns = [
            r'/\d{3,}/',
            r'/(img|pic|image|thumb|gallery|video)s?/',
            r'/(model|cam|chat|member)s?/',
            r'/(categories?|tags?|channels?)/'
        ]
        for pattern in path_patterns:
            if re.search(pattern, url_lower):
                features['path_score'] += 0.25
        features['path_score'] = min(features['path_score'], 1.0)
        
        # TLD risk
        risky_tlds = ['.xxx', '.porn', '.adult', '.sex', '.cam']
        for tld in risky_tlds:
            if url_lower.endswith(tld):
                features['tld_risk'] = 1.0
                break
        
        # Numeric in domain (suspicious)
        domain_match = re.search(r'/(\d+)', url_lower)
        if domain_match:
            features['numeric_in_domain'] = min(len(domain_match.group(1)) / 5, 1.0)
        
        # Suspicious patterns
        suspicious = [
            r'(free|premium|vip|gold|elite)',
            r'(18\+|adults?only|mature)',
            r'(hot|sexy|nude|naked)'
        ]
        for pattern in suspicious:
            if re.search(pattern, url_lower):
                features['suspicious_patterns'] += 0.33
        features['suspicious_patterns'] = min(features['suspicious_patterns'], 1.0)
        
        return features
    
    def build_training_set(self) -> List[Dict]:
        """Build complete training dataset with positive and negative examples"""
        training_set = []
        
        # Positive examples (adult domains)
        for domain in self.training_domains:
            url = f"https://{domain}"
            features = self.extract_features(url, True)
            features['label'] = 1  # Adult
            training_set.append(features)
            
            # Add variations
            variations = [
                f"https://www.{domain}",
                f"https://{domain}/videos",
                f"https://{domain}/gallery/123"
            ]
            for var_url in variations:
                var_features = self.extract_features(var_url, True)
                var_features['label'] = 1
                training_set.append(var_features)
        
        # Negative examples (safe domains)
        for domain in self.safe_domains:
            url = f"https://{domain}"
            features = self.extract_features(url, False)
            features['label'] = 0  # Safe
            training_set.append(features)
        
        # Shuffle training set
        random.shuffle(training_set)
        self.feature_vectors = training_set
        
        print(f"Built training set with {len(training_set)} examples")
        print(f"  Adult examples: {sum(1 for f in training_set if f['label'] == 1)}")
        print(f"  Safe examples: {sum(1 for f in training_set if f['label'] == 0)}")
        
        return training_set
    
    def train(self) -> Dict:
        """Train the model on collected data"""
        print("\n" + "="*60)
        print("Training Content Shield AI Model")
        print("="*60)
        
        # Load data
        self.load_training_data()
        self.load_safe_domains()
        
        # Build training set
        training_set = self.build_training_set()
        
        if not training_set:
            print("No training data available!")
            return {}
        
        # Calculate feature weights based on correlation with adult content
        feature_names = ['domain_score', 'keyword_score', 'path_score', 
                        'tld_risk', 'numeric_in_domain', 'suspicious_patterns']
        
        weights = {}
        for feature in feature_names:
            adult_avg = sum(f[feature] for f in training_set if f['label'] == 1)
            adult_count = sum(1 for f in training_set if f['label'] == 1)
            safe_avg = sum(f[feature] for f in training_set if f['label'] == 0)
            safe_count = sum(1 for f in training_set if f['label'] == 0)
            
            if adult_count > 0 and safe_count > 0:
                adult_avg /= adult_count
                safe_avg /= safe_count
                # Weight is difference between adult and safe averages
                weights[feature] = max(adult_avg - safe_avg, 0.01)
            else:
                weights[feature] = 0.5
        
        # Normalize weights
        total_weight = sum(weights.values())
        if total_weight > 0:
            weights = {k: v/total_weight for k, v in weights.values()}
        
        self.weights = weights
        
        # Calculate accuracy on training set
        correct = 0
        for sample in training_set:
            score = sum(sample[f] * weights.get(f, 0) for f in feature_names)
            predicted = 1 if score > 0.5 else 0
            if predicted == sample['label']:
                correct += 1
        
        accuracy = correct / len(training_set)
        
        print(f"\nTraining complete!")
        print(f"Feature weights: {weights}")
        print(f"Training accuracy: {accuracy:.2%}")
        
        return {
            'weights': weights,
            'accuracy': accuracy,
            'training_size': len(training_set)
        }
    
    def save_model(self, filepath: str = None) -> bool:
        """Save trained model to disk"""
        if filepath:
            self.model_path = Path(filepath)
        
        try:
            model_data = {
                'weights': getattr(self, 'weights', {}),
                'domain_weights': self.domain_weights,
                'keyword_weights': self.keyword_weights,
                'pattern_scores': self.pattern_scores,
                'training_domains_count': len(self.training_domains),
                'training_keywords_count': len(self.training_keywords),
                'version': '2.0.0-ai',
                'learning_rate': self.learning_rate
            }
            
            with open(self.model_path, 'wb') as f:
                pickle.dump(model_data, f)
            
            print(f"Model saved to {self.model_path}")
            return True
            
        except Exception as e:
            print(f"Error saving model: {e}")
            return False
    
    def load_model(self, filepath: str = None) -> bool:
        """Load trained model from disk"""
        if filepath:
            self.model_path = Path(filepath)
        
        try:
            with open(self.model_path, 'rb') as f:
                model_data = pickle.load(f)
            
            self.weights = model_data.get('weights', {})
            self.domain_weights = model_data.get('domain_weights', {})
            self.keyword_weights = model_data.get('keyword_weights', {})
            self.pattern_scores = model_data.get('pattern_scores', {})
            self.learning_rate = model_data.get('learning_rate', 0.1)
            
            print(f"Model loaded from {self.model_path}")
            print(f"Version: {model_data.get('version', 'unknown')}")
            return True
            
        except Exception as e:
            print(f"Error loading model: {e}")
            return False
    
    def incremental_learn(self, url: str, is_adult: bool, confirmed: bool = True) -> None:
        """
        Incrementally update model with new example
        """
        if not confirmed:
            return
        
        # Extract features
        features = self.extract_features(url, is_adult)
        
        # Update weights based on error (simple gradient descent)
        prediction = sum(features.get(k, 0) * self.weights.get(k, 0) 
                        for k in self.weights.keys())
        error = (1.0 if is_adult else 0.0) - prediction
        
        for key in self.weights:
            if key in features:
                self.weights[key] += self.learning_rate * error * features[key]
        
        # Ensure weights stay positive and normalized
        for key in self.weights:
            self.weights[key] = max(0.01, self.weights[key])
        
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v/total for k, v in self.weights.items()}
        
        print(f"Incremental learning: updated weights for {url}")


if __name__ == '__main__':
    trainer = ModelTrainer()
    
    # Train model
    results = trainer.train()
    
    # Save model
    if results:
        trainer.save_model()
        
        print("\n" + "="*60)
        print("Model training complete!")
        print("="*60)
        print(f"Training accuracy: {results['accuracy']:.2%}")
        print(f"Training examples: {results['training_size']}")
