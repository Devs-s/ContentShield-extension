# Content Shield AI Module
# Machine Learning-based adult content detection

from .detector import AdultContentDetector
from .trainer import ModelTrainer
from .predictor import ContentPredictor

__version__ = "2.0.0-ai"
__all__ = ['AdultContentDetector', 'ModelTrainer', 'ContentPredictor']
