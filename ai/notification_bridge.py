#!/usr/bin/env python3
"""
Content Shield AI Notification Bridge
Bridges Python AI with browser extension notifications
Creates system notifications with "Bad Boy" message
"""

import json
import sys
import platform
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class ShieldNotification:
    """Notification data structure"""
    title: str
    message: str
    subtitle: str
    url: str
    confidence: float
    timestamp: str
    icon: str = "🛡️"
    sound: bool = True

class NotificationBridge:
    """
    Bridge between AI detection and system notifications
    Displays "Bad Boy" alerts when adult content is detected
    """
    
    def __init__(self):
        self.os_type = platform.system()
        self.notification_history = []
        self.max_history = 100
        
    def create_bad_boy_notification(self, url: str, confidence: float, 
                                   matched_keywords: list) -> ShieldNotification:
        """
        Create the iconic "Bad Boy" notification
        """
        # Build the dramatic message
        if confidence >= 0.9:
            title = "🔴 BAD BOY DETECTED!"
            subtitle = "High-risk adult content blocked!"
            message = f"⚠️ Adult content detected at {url}\n"
            message += f"🚫 Confidence: {confidence:.1%}\n"
            message += "🛡️ Stay safe! Content Shield is protecting you!"
            icon = "🚨"
            sound = True
            
        elif confidence >= 0.7:
            title = "⚠️ BAD BOY ALERT!"
            subtitle = "Adult content detected and blocked!"
            message = f"🚫 Blocked: {url}\n"
            message += f"📊 Confidence: {confidence:.1%}\n"
            message += "💪 Good job avoiding temptation!"
            icon = "🛡️"
            sound = True
            
        else:
            title = "Content Shield Alert"
            subtitle = "Potentially inappropriate content"
            message = f"⚠️ {url} may contain adult content\n"
            message += f"Confidence: {confidence:.1%}"
            icon = "⚠️"
            sound = False
        
        notification = ShieldNotification(
            title=title,
            message=message,
            subtitle=subtitle,
            url=url,
            confidence=confidence,
            timestamp=datetime.now().isoformat(),
            icon=icon,
            sound=sound
        )
        
        # Add to history
        self.notification_history.append({
            'timestamp': notification.timestamp,
            'url': url,
            'title': title,
            'confidence': confidence,
            'blocked': True
        })
        
        # Trim history
        if len(self.notification_history) > self.max_history:
            self.notification_history = self.notification_history[-self.max_history:]
        
        return notification
    
    def send_notification(self, notification: ShieldNotification) -> bool:
        """
        Send notification to the system/browser extension
        """
        try:
            # Output notification data as JSON for the extension to capture
            notification_data = {
                'type': 'CONTENT_SHIELD_ALERT',
                'version': '2.0.0-ai',
                'title': notification.title,
                'message': notification.message,
                'subtitle': notification.subtitle,
                'url': notification.url,
                'confidence': notification.confidence,
                'timestamp': notification.timestamp,
                'icon': notification.icon,
                'sound': notification.sound,
                'action': 'BLOCKED',
                'display_message': f"BAD BOY! Adult content blocked! Confidence: {notification.confidence:.1%}"
            }
            
            # Print to stdout for extension to capture
            print(json.dumps(notification_data, indent=2))
            
            # Try platform-specific notification
            self._send_system_notification(notification_data)
            
            return True
            
        except Exception as e:
            print(f"Error sending notification: {e}", file=sys.stderr)
            return False
    
    def _send_system_notification(self, data: Dict) -> None:
        """Send system-level notification based on OS"""
        try:
            if self.os_type == "Windows":
                self._windows_notification(data)
            elif self.os_type == "Darwin":  # macOS
                self._macos_notification(data)
            elif self.os_type == "Linux":
                self._linux_notification(data)
        except Exception as e:
            print(f"System notification failed: {e}", file=sys.stderr)
    
    def _windows_notification(self, data: Dict) -> None:
        """Windows toast notification"""
        try:
            from win10toast import ToastNotifier
            toaster = ToastNotifier()
            toaster.show_toast(
                data['title'],
                data['display_message'],
                duration=10,
                threaded=True
            )
        except ImportError:
            # Fallback to winotify
            try:
                from winotify import Notification
                toast = Notification(
                    app_id="Content Shield",
                    title=data['title'],
                    msg=data['display_message'],
                    duration="long"
                )
                toast.show()
            except ImportError:
                pass
    
    def _macos_notification(self, data: Dict) -> None:
        """macOS notification"""
        try:
            import subprocess
            script = f'''
            display notification "{data['display_message']}" 
            with title "{data['title']}" 
            sound name "Glass"
            '''
            subprocess.run(['osascript', '-e', script], check=True)
        except:
            pass
    
    def _linux_notification(self, data: Dict) -> None:
        """Linux notification"""
        try:
            import subprocess
            subprocess.run([
                'notify-send',
                '--urgency=critical',
                '--icon=dialog-warning',
                data['title'],
                data['display_message']
            ], check=True)
        except:
            pass
    
    def get_notification_history(self) -> list:
        """Get history of notifications"""
        return self.notification_history
    
    def clear_history(self) -> None:
        """Clear notification history"""
        self.notification_history = []
    
    def export_for_extension(self) -> str:
        """
        Export notification data in format for browser extension
        This creates a JSON file that the extension can read
        """
        export_data = {
            'last_notification': self.notification_history[-1] if self.notification_history else None,
            'history': self.notification_history[-10:],  # Last 10
            'total_blocked': len(self.notification_history),
            'version': '2.0.0-ai',
            'bad_boy_count': sum(1 for n in self.notification_history 
                               if 'BAD BOY' in n.get('title', ''))
        }
        
        # Write to file for extension to read
        export_path = Path(__file__).parent / 'notification_data.json'
        with open(export_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        return str(export_path)


class ExtensionAPI:
    """
    API for browser extension to communicate with AI
    """
    
    def __init__(self):
        self.bridge = NotificationBridge()
        self.predictor = None
        
    def check_url(self, url: str) -> Dict:
        """Check URL and return result for extension"""
        from .predictor import ContentPredictor
        
        if not self.predictor:
            self.predictor = ContentPredictor()
        
        result = self.predictor.predict(url)
        
        # If blocked, send notification
        if result['blocked']:
            notification = self.bridge.create_bad_boy_notification(
                url, 
                result['confidence'],
                result.get('matched_keywords', [])
            )
            self.bridge.send_notification(notification)
            self.bridge.export_for_extension()
        
        return result
    
    def handle_extension_message(self, message: str) -> str:
        """Handle message from browser extension"""
        try:
            data = json.loads(message)
            action = data.get('action')
            
            if action == 'check_url':
                result = self.check_url(data.get('url'))
                return json.dumps(result)
            
            elif action == 'get_history':
                history = self.bridge.get_notification_history()
                return json.dumps({'history': history})
            
            elif action == 'clear_history':
                self.bridge.clear_history()
                return json.dumps({'cleared': True})
            
            elif action == 'get_stats':
                if not self.predictor:
                    from .predictor import ContentPredictor
                    self.predictor = ContentPredictor()
                stats = self.predictor.get_stats()
                stats['bad_boy_count'] = sum(1 for n in self.bridge.notification_history 
                                            if 'BAD BOY' in n.get('title', ''))
                return json.dumps(stats)
            
            else:
                return json.dumps({'error': 'Unknown action'})
                
        except json.JSONDecodeError:
            return json.dumps({'error': 'Invalid JSON'})
        except Exception as e:
            return json.dumps({'error': str(e)})


def main():
    """Run as standalone notification bridge"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Content Shield Notification Bridge')
    parser.add_argument('--url', '-u', help='URL to check and notify')
    parser.add_argument('--message', '-m', help='Custom message')
    parser.add_argument('--confidence', '-c', type=float, default=0.85, help='Confidence level')
    parser.add_argument('--history', action='store_true', help='Show notification history')
    parser.add_argument('--test', '-t', action='store_true', help='Send test notification')
    
    args = parser.parse_args()
    
    bridge = NotificationBridge()
    
    if args.history:
        history = bridge.get_notification_history()
        print(json.dumps(history, indent=2))
        return
    
    if args.test:
        notification = bridge.create_bad_boy_notification(
            "https://example-bad-site.com",
            0.95,
            ["adult", "xxx", "porn"]
        )
        bridge.send_notification(notification)
        print("Test notification sent!")
        return
    
    if args.url:
        notification = bridge.create_bad_boy_notification(
            args.url,
            args.confidence,
            ["detected"]
        )
        bridge.send_notification(notification)
        print(f"Notification sent for {args.url}")
        return
    
    # Run as API server
    print("Content Shield Notification Bridge - Extension API Mode")
    print("Waiting for extension messages...")
    
    api = ExtensionAPI()
    
    while True:
        try:
            line = input()
            if not line:
                continue
            
            response = api.handle_extension_message(line)
            print(response)
            
        except EOFError:
            break
        except KeyboardInterrupt:
            break
    
    print("Notification bridge shutting down...")


if __name__ == '__main__':
    main()
