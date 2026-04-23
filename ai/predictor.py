#!/usr/bin/env python3
"""
Content Shield AI Content Predictor
Real-time prediction API for the extension
"""

import json
import sys
import argparse
from pathlib import Path
from typing import Dict, Optional
from .detector import AdultContentDetector, DetectionResult
from .trainer import ModelTrainer

class ContentPredictor:
    """
    High-level API for content prediction
    Used by the extension to check URLs in real-time
    """
    
    def __init__(self, model_path: str = None):
        self.model_path = Path(model_path) if model_path else Path(__file__).parent / 'trained_model.pkl'
        self.detector = AdultContentDetector()
        self.trainer = ModelTrainer(model_path=model_path)
        
        # Try to load trained model
        if self.model_path.exists():
            self.detector.load_model(str(self.model_path))
            self.trainer.load_model(str(self.model_path))
    
    def predict(self, url: str) -> Dict:
        """
        Predict if content is adult material
        Returns detailed prediction result
        """
        result = self.detector.analyze_url(url)
        
        return {
            'blocked': result.is_adult,
            'confidence': result.confidence,
            'category': result.category,
            'risk_level': self._get_risk_level(result.confidence),
            'matched_keywords': result.matched_keywords,
            'message': result.message,
            'notification_title': 'Content Shield Alert',
            'notification_message': self._get_notification_message(result),
            'suggestion': 'Stay safe online! 🛡️'
        }
    
    def _get_risk_level(self, confidence: float) -> str:
        """Convert confidence to risk level"""
        if confidence >= 0.85:
            return 'HIGH'
        elif confidence >= 0.7:
            return 'MEDIUM'
        elif confidence >= 0.5:
            return 'LOW'
        return 'NONE'
    
    def _get_notification_message(self, result: DetectionResult) -> str:
        """Generate notification message based on detection result"""
        if result.is_adult:
            if result.confidence >= 0.85:
                return "🔴 BAD BOY! Adult content blocked! Stay safe! 🛡️"
            elif result.confidence >= 0.7:
                return "⚠️ BAD BOY! Suspicious adult content detected! 🚫"
            else:
                return "⚠️ Potentially inappropriate content blocked 🛡️"
        return "✅ Site appears safe"
    
    def predict_batch(self, urls: list) -> list:
        """Predict multiple URLs at once"""
        return [self.predict(url) for url in urls]
    
    def learn(self, url: str, is_adult: bool, confirmed: bool = True) -> bool:
        """Learn from user feedback"""
        try:
            self.detector.learn_from_block(url, confirmed)
            self.trainer.incremental_learn(url, is_adult, confirmed)
            
            # Save updated model
            self.detector.save_model(str(self.model_path))
            self.trainer.save_model(str(self.model_path))
            
            return True
        except Exception as e:
            print(f"Error during learning: {e}", file=sys.stderr)
            return False
    
    def get_stats(self) -> Dict:
        """Get predictor statistics"""
        return {
            'detector_stats': self.detector.get_stats(),
            'model_loaded': self.model_path.exists(),
            'model_path': str(self.model_path)
        }
    
    def retrain(self) -> bool:
        """Retrain model from scratch"""
        try:
            results = self.trainer.train()
            if results:
                self.trainer.save_model(str(self.model_path))
                return True
            return False
        except Exception as e:
            print(f"Error during retraining: {e}", file=sys.stderr)
            return False


def main():
    """CLI interface for prediction"""
    parser = argparse.ArgumentParser(description='Content Shield AI Predictor')
    parser.add_argument('url', nargs='?', help='URL to check')
    parser.add_argument('--batch', '-b', nargs='+', help='Batch check multiple URLs')
    parser.add_argument('--stats', '-s', action='store_true', help='Show stats')
    parser.add_argument('--learn', '-l', help='Learn from URL (format: url,is_adult)')
    parser.add_argument('--retrain', '-r', action='store_true', help='Retrain model')
    parser.add_argument('--json', '-j', action='store_true', help='Output as JSON')
    
    args = parser.parse_args()
    
    predictor = ContentPredictor()
    
    if args.stats:
        stats = predictor.get_stats()
        print(json.dumps(stats, indent=2))
        return
    
    if args.retrain:
        success = predictor.retrain()
        print(json.dumps({'retrained': success}, indent=2))
        return
    
    if args.learn:
        parts = args.learn.split(',')
        if len(parts) == 2:
            url, is_adult = parts[0], parts[1].lower() == 'true'
            success = predictor.learn(url, is_adult)
            print(json.dumps({'learned': success}, indent=2))
        else:
            print("Error: Use format url,true or url,false")
        return
    
    if args.batch:
        results = predictor.predict_batch(args.batch)
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            for url, result in zip(args.batch, results):
                print(f"\nURL: {url}")
                print(f"  Blocked: {result['blocked']}")
                print(f"  Confidence: {result['confidence']:.2%}")
                print(f"  Risk Level: {result['risk_level']}")
                print(f"  Message: {result['notification_message']}")
        return
    
    if args.url:
        result = predictor.predict(args.url)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\nURL: {args.url}")
            print(f"  Blocked: {result['blocked']}")
            print(f"  Confidence: {result['confidence']:.2%}")
            print(f"  Category: {result['category']}")
            print(f"  Risk Level: {result['risk_level']}")
            print(f"  Notification: {result['notification_message']}")
        return
    
    # Interactive mode
    print("Content Shield AI Predictor - Interactive Mode")
    print("Enter URLs to check (or 'quit' to exit):\n")
    
    while True:
        try:
            url = input("> ").strip()
            if url.lower() in ['quit', 'exit', 'q']:
                break
            if not url:
                continue
            
            result = predictor.predict(url)
            
            print(f"  Blocked: {result['blocked']}")
            print(f"  Confidence: {result['confidence']:.2%}")
            print(f"  Risk Level: {result['risk_level']}")
            print(f"  ════════════════════════════════════")
            print(f"  🔔 {result['notification_message']}")
            print(f"  ════════════════════════════════════\n")
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
    
    print("\nGoodbye! Stay safe! 🛡️")


if __name__ == '__main__':
    main()
