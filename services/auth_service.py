"""
services/auth_service.py - Google Drive Authentication
"""
import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid', # Required for userinfo
]
TOKEN_FILE = "token.json"
CREDENTIALS_FILE = "credentials.json"

class GoogleAuthService:
    def __init__(self):
        self.creds = None

    def login(self) -> bool:
        """Authenticates user and saves token.json. Returns True if successful."""
        try:
            if os.path.exists(TOKEN_FILE):
                self.creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
                
            if not self.creds or not self.creds.valid:
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    self.creds.refresh(Request())
                else:
                    if not os.path.exists(CREDENTIALS_FILE):
                        print(f"Error: {CREDENTIALS_FILE} not found.")
                        return False
                    flow = InstalledAppFlow.from_client_secrets_file(
                        CREDENTIALS_FILE, SCOPES)
                    
                    # Run local server on a random port to capture redirect
                    self.creds = flow.run_local_server(port=0, access_type='offline')
                    
                # Save the credentials for the next run
                with open(TOKEN_FILE, 'w') as token:
                    token.write(self.creds.to_json())
            return True
        except Exception as e:
            print(f"Auth completely failed: {e}")
            self.creds = None
            return False

    def logout(self):
        """Removes local token."""
        self.creds = None
        if os.path.exists(TOKEN_FILE):
            os.remove(TOKEN_FILE)

    def is_logged_in(self) -> bool:
        # Quick check without refreshing
        if os.path.exists(TOKEN_FILE):
            try:
                creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
                return creds.valid or (creds.expired and creds.refresh_token is not None)
            except:
                return False
        return False

    def get_credentials(self) -> Credentials:
        if not self.creds and self.is_logged_in():
            self.login()
        return self.creds

    def get_user_email(self) -> str:
        """Fetches the authenticated user's email."""
        creds = self.get_credentials()
        if not creds:
            return ""
        try:
            service = build('oauth2', 'v2', credentials=creds)
            user_info = service.userinfo().get().execute()
            return user_info.get('email', '')
        except Exception as e:
            print(f"Failed to fetch user info: {e}")
            return ""
