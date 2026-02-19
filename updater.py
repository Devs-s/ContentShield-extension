#!/usr/bin/env python3
"""
Content Shield Extension Updater
Automatically updates the Content Shield extension from GitHub repository
"""

import os
import json
import requests
import subprocess
import shutil
from datetime import datetime
from typing import Dict, Optional

class ExtensionUpdater:
    def __init__(self, repo_url: str = "https://api.github.com/repos/Devs-s/ContentShield-extension"):
        self.repo_url = repo_url
        self.local_path = os.path.dirname(__file__)
        self.backup_path = os.path.join(self.local_path, "_backup")
        
    def check_for_updates(self) -> Optional[Dict]:
        """Check if there are updates available on GitHub"""
        try:
            # Get latest release info
            api_url = f"{self.repo_url}/releases/latest"
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            
            latest_release = response.json()
            latest_version = latest_release.get('tag_name', 'v1.0.0').lstrip('v')
            
            # Check current version
            current_version = self.get_current_version()
            
            if self.version_compare(latest_version, current_version) > 0:
                return {
                    'has_update': True,
                    'latest_version': latest_version,
                    'current_version': current_version,
                    'release_info': latest_release
                }
            
            return {'has_update': False}
            
        except Exception as e:
            print(f"Error checking for updates: {e}")
            return None
    
    def get_current_version(self) -> str:
        """Get current extension version from manifest.json"""
        manifest_file = os.path.join(self.local_path, "manifest.json")
        
        try:
            with open(manifest_file, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
                return manifest.get('version', '1.0.0')
        except FileNotFoundError:
            return "1.0.0"
    
    def version_compare(self, version1: str, version2: str) -> int:
        """Compare two version strings (returns 1 if v1 > v2, 0 if equal, -1 if v1 < v2)"""
        v1_parts = [int(x) for x in version1.split('.')]
        v2_parts = [int(x) for x in version2.split('.')]
        
        # Pad shorter version with zeros
        max_len = max(len(v1_parts), len(v2_parts))
        v1_parts.extend([0] * (max_len - len(v1_parts)))
        v2_parts.extend([0] * (max_len - len(v2_parts)))
        
        for v1, v2 in zip(v1_parts, v2_parts):
            if v1 > v2:
                return 1
            elif v1 < v2:
                return -1
        
        return 0
    
    def create_backup(self) -> bool:
        """Create backup of current extension files"""
        try:
            if os.path.exists(self.backup_path):
                shutil.rmtree(self.backup_path)
            
            shutil.copytree(self.local_path, self.backup_path, 
                          ignore=shutil.ignore_patterns('_backup', '*.pyc', '__pycache__'))
            
            print(f"Backup created at {self.backup_path}")
            return True
            
        except Exception as e:
            print(f"Error creating backup: {e}")
            return False
    
    def download_update(self, download_url: str) -> bool:
        """Download and extract update from GitHub"""
        try:
            # Download the release zip file
            response = requests.get(download_url, timeout=60)
            response.raise_for_status()
            
            # Save to temporary file
            temp_file = os.path.join(self.local_path, "update.zip")
            with open(temp_file, 'wb') as f:
                f.write(response.content)
            
            # Extract the update
            import zipfile
            with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                zip_ref.extractall(os.path.join(self.local_path, "_temp_update"))
            
            # Clean up temp file
            os.remove(temp_file)
            
            return True
            
        except Exception as e:
            print(f"Error downloading update: {e}")
            return False
    
    def apply_update(self, update_info: Dict) -> bool:
        """Apply the downloaded update"""
        try:
            temp_update_path = os.path.join(self.local_path, "_temp_update")
            
            # Find the extracted folder (usually named after repo)
            extracted_folders = [f for f in os.listdir(temp_update_path) 
                              if os.path.isdir(os.path.join(temp_update_path, f))]
            
            if not extracted_folders:
                print("No extracted folder found")
                return False
            
            source_path = os.path.join(temp_update_path, extracted_folders[0])
            
            # Copy updated files, preserving local customizations
            self.copy_updated_files(source_path, self.local_path)
            
            # Clean up
            shutil.rmtree(temp_update_path)
            
            print("Update applied successfully")
            return True
            
        except Exception as e:
            print(f"Error applying update: {e}")
            return False
    
    def copy_updated_files(self, source: str, destination: str):
        """Copy updated files while preserving local customizations"""
        # Files to preserve (local customizations)
        preserve_files = [
            'filters/domains.json',
            'filters/keywords.json',
            'scraper.py',
            'requirements.txt',
            'updater.py'
        ]
        
        # Copy all files except preserved ones
        for root, dirs, files in os.walk(source):
            # Calculate relative path
            rel_path = os.path.relpath(root, source)
            dest_dir = os.path.join(destination, rel_path)
            
            # Create directory if it doesn't exist
            if not os.path.exists(dest_dir):
                os.makedirs(dest_dir)
            
            for file in files:
                source_file = os.path.join(root, file)
                rel_file_path = os.path.join(rel_path, file)
                
                # Skip preserved files
                if rel_file_path in preserve_files:
                    continue
                
                dest_file = os.path.join(dest_dir, file)
                
                # Copy file
                shutil.copy2(source_file, dest_file)
    
    def restore_backup(self) -> bool:
        """Restore from backup if update fails"""
        try:
            if os.path.exists(self.backup_path):
                # Remove current files
                for item in os.listdir(self.local_path):
                    item_path = os.path.join(self.local_path, item)
                    if item != '_backup' and os.path.exists(item_path):
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                        else:
                            os.remove(item_path)
                
                # Restore from backup
                for item in os.listdir(self.backup_path):
                    source = os.path.join(self.backup_path, item)
                    dest = os.path.join(self.local_path, item)
                    
                    if os.path.isdir(source):
                        shutil.copytree(source, dest)
                    else:
                        shutil.copy2(source, dest)
                
                print("Backup restored successfully")
                return True
            
        except Exception as e:
            print(f"Error restoring backup: {e}")
        
        return False
    
    def update_extension(self, force: bool = False) -> bool:
        """Main update function"""
        print("Checking for Content Shield extension updates...")
        
        # Check for updates
        update_info = self.check_for_updates()
        
        if update_info is None:
            print("Failed to check for updates")
            return False
        
        if not update_info['has_update'] and not force:
            print("Extension is up to date")
            return True
        
        if update_info['has_update']:
            print(f"Update available: {update_info['current_version']} -> {update_info['latest_version']}")
        
        # Create backup
        if not self.create_backup():
            print("Failed to create backup, aborting update")
            return False
        
        try:
            # Download update
            download_url = update_info['release_info']['zipball_url']
            if not self.download_update(download_url):
                print("Failed to download update")
                self.restore_backup()
                return False
            
            # Apply update
            if not self.apply_update(update_info):
                print("Failed to apply update")
                self.restore_backup()
                return False
            
            # Update version info
            self.update_version_info(update_info['latest_version'])
            
            print(f"Extension updated successfully to version {update_info['latest_version']}")
            return True
            
        except Exception as e:
            print(f"Update failed: {e}")
            self.restore_backup()
            return False
    
    def update_version_info(self, new_version: str):
        """Update version information in manifest files"""
        manifest_files = [
            'manifest.json',
            'manifest-firefox.json',
            'manifest-edge.json',
            'manifest-safari.json'
        ]
        
        for manifest_file in manifest_files:
            manifest_path = os.path.join(self.local_path, manifest_file)
            
            if os.path.exists(manifest_path):
                try:
                    with open(manifest_path, 'r', encoding='utf-8') as f:
                        manifest = json.load(f)
                    
                    manifest['version'] = new_version
                    
                    with open(manifest_path, 'w', encoding='utf-8') as f:
                        json.dump(manifest, f, indent=2)
                    
                except Exception as e:
                    print(f"Error updating {manifest_file}: {e}")
    
    def run_scraper_update(self) -> bool:
        """Run the scraper to update filters"""
        try:
            scraper_file = os.path.join(self.local_path, 'scraper.py')
            
            if os.path.exists(scraper_file):
                print("Running filter scraper...")
                result = subprocess.run(['python', scraper_file], 
                                      capture_output=True, text=True, timeout=300)
                
                if result.returncode == 0:
                    print("Filter scraper completed successfully")
                    return True
                else:
                    print(f"Scraper failed: {result.stderr}")
                    return False
            else:
                print("Scraper not found")
                return False
                
        except Exception as e:
            print(f"Error running scraper: {e}")
            return False
    
    def full_update(self) -> bool:
        """Perform full update (extension + filters)"""
        print("Starting full update process...")
        
        # Update extension
        if not self.update_extension():
            print("Extension update failed")
            return False
        
        # Update filters
        if not self.run_scraper_update():
            print("Filter update failed, but extension was updated")
            # Don't return False here as extension update was successful
        
        print("Full update completed")
        return True

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Update Content Shield extension')
    parser.add_argument('--force', action='store_true', help='Force update even if up to date')
    parser.add_argument('--scraper-only', action='store_true', help='Only run scraper update')
    parser.add_argument('--extension-only', action='store_true', help='Only update extension')
    parser.add_argument('--repo', type=str, help='GitHub repository URL')
    
    args = parser.parse_args()
    
    # Initialize updater
    repo_url = args.repo if args.repo else "https://api.github.com/repos/Devs-s/ContentShield-extension"
    updater = ExtensionUpdater(repo_url)
    
    if args.scraper_only:
        success = updater.run_scraper_update()
    elif args.extension_only:
        success = updater.update_extension(args.force)
    else:
        success = updater.full_update()
    
    if success:
        print("Update completed successfully")
    else:
        print("Update failed")
        exit(1)

if __name__ == "__main__":
    main()
