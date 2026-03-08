"""
services/sync_service.py - Google Drive AppData Synchronization
"""
import json
import socket
from typing import Tuple
from io import BytesIO
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError
from services.auth_service import GoogleAuthService
from services.storage_service import (
    DECKS_FILE, QUIZ_SESSIONS_FILE,
    load_decks, save_decks,
    load_quiz_sessions, save_quiz_session
)
from models.flashcard import Deck, QuizSession


class SyncService:
    def __init__(self, auth_service: GoogleAuthService):
        self.auth_service = auth_service
        self.drive_service = None

    def _get_drive_service(self):
        if not self.drive_service:
            creds = self.auth_service.get_credentials()
            if not creds:
                raise Exception("Not authenticated")
            self.drive_service = build('drive', 'v3', credentials=creds)
        return self.drive_service

    def _check_internet(self) -> bool:
        try:
            # Check connection to Google DNS
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            return True
        except OSError:
            return False

    def _find_file_in_appdata(self, filename: str):
        service = self._get_drive_service()
        response = service.files().list(
            spaces='appDataFolder',
            fields='nextPageToken, files(id, name)',
            q=f"name='{filename}'"
        ).execute()
        files = response.get('files', [])
        return files[0] if files else None

    def _download_json(self, file_id: str) -> dict:
        service = self._get_drive_service()
        request = service.files().get_media(fileId=file_id)
        fh = BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        fh.seek(0)
        content = fh.read().decode('utf-8')
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None

    def _upload_json(self, filename: str, file_id: str, data: dict):
        service = self._get_drive_service()
        media = MediaIoBaseUpload(
            BytesIO(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')),
            mimetype='application/json',
            resumable=True
        )
        if file_id:
            # Update existing
            service.files().update(
                fileId=file_id,
                media_body=media
            ).execute()
        else:
            # Create new in appDataFolder
            file_metadata = {
                'name': filename,
                'parents': ['appDataFolder']
            }
            service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()

    def sync_decks(self) -> Tuple[bool, str]:
        if not self._check_internet():
            return False, "Không có kết nối mạng"
        
        try:
            service = self._get_drive_service()
            remote_file = self._find_file_in_appdata('decks.json')
            
            # Load remote decks
            remote_decks_data = []
            if remote_file:
                remote_data = self._download_json(remote_file['id'])
                if isinstance(remote_data, list):
                    remote_decks_data = remote_data
                    
            # Load local decks
            local_decks = load_decks()
            local_decks_map = {d.deck_id: d for d in local_decks}
            
            # Smart Merge Decks
            merged_decks_map = {}
            for rd_data in remote_decks_data:
                rd_id = rd_data.get('deck_id')
                rd_updated_at = rd_data.get('updated_at', '')
                
                if rd_id in local_decks_map:
                    ld = local_decks_map[rd_id]
                    ld_updated_at = ld.updated_at
                    
                    if rd_updated_at > ld_updated_at:
                        # Remote is newer, take remote
                        r_deck = Deck.from_dict(rd_data)
                        print(f"Sync: Remote deck {r_deck.name} is newer, pulling...")
                        
                        # Crucial fix: Preserve local image paths
                        r_cards_map = {c.card_id: c for c in r_deck.cards}
                        for loc_card in ld.cards:
                            if loc_card.card_id in r_cards_map and loc_card.image_path:
                                # Inject local image_path back to pulled remote card
                                r_cards_map[loc_card.card_id].image_path = loc_card.image_path
                                
                        merged_decks_map[rd_id] = r_deck
                    else:
                        # Local is newer or same
                        merged_decks_map[rd_id] = ld
                else:
                    # Remote deck doesn't exist locally, pull it
                    merged_decks_map[rd_id] = Deck.from_dict(rd_data)
                    
            # Add remaining local decks that don't exist remotely
            for ld_id, ld in local_decks_map.items():
                if ld_id not in merged_decks_map:
                    merged_decks_map[ld_id] = ld
                    
            # Save merged locally
            merged_list = list(merged_decks_map.values())
            
            # Update file without modifying updated_at timestamps (bypass save_decks to not bump timestamp globally)
            import os
            from services.storage_service import _ensure_dir
            _ensure_dir()
            with open(DECKS_FILE, "w", encoding="utf-8") as f:
                json.dump([d.to_dict() for d in merged_list], f, ensure_ascii=False, indent=2)
                
            # Upload to Drive
            self._upload_json('decks.json', remote_file['id'] if remote_file else None, [d.to_dict() for d in merged_list])
            
            return True, "Đồng bộ Decks thành công"
            
        except HttpError as error:
            print(f"An error occurred: {error}")
            return False, f"Lỗi Google Drive: {error.resp.status}"
        except Exception as e:
            print(f"Sync decks error: {e}")
            return False, f"Lỗi: {e}"

    def sync_quiz_sessions(self) -> Tuple[bool, str]:
        if not self._check_internet():
            return False, "Không có kết nối mạng"
            
        try:
            remote_file = self._find_file_in_appdata('quiz_sessions.json')
            
            # Load remote sessions
            remote_sessions_data = {}
            if remote_file:
                rd = self._download_json(remote_file['id'])
                if isinstance(rd, dict):
                    remote_sessions_data = rd
                    
            # Load local sessions
            local_sessions = load_quiz_sessions()
            
            # Smart Merge Sessions
            merged_sessions_data = {}
            
            all_deck_ids = set(remote_sessions_data.keys()).union(set(local_sessions.keys()))
            
            for deck_id in all_deck_ids:
                has_remote = deck_id in remote_sessions_data
                has_local = deck_id in local_sessions
                
                if has_remote and has_local:
                    rs_data = remote_sessions_data[deck_id]
                    ls = local_sessions[deck_id]
                    
                    rs_updated = rs_data.get('updated_at', '')
                    ls_updated = ls.updated_at
                    
                    if rs_updated > ls_updated:
                        merged_sessions_data[deck_id] = rs_data
                    else:
                        merged_sessions_data[deck_id] = ls.to_dict()
                elif has_remote:
                    merged_sessions_data[deck_id] = remote_sessions_data[deck_id]
                else:
                    merged_sessions_data[deck_id] = local_sessions[deck_id].to_dict()
                    
            # Save merged locally
            import os
            from services.storage_service import _ensure_dir
            _ensure_dir()
            with open(QUIZ_SESSIONS_FILE, "w", encoding="utf-8") as f:
                json.dump(merged_sessions_data, f, ensure_ascii=False, indent=2)
                
            # Upload to Drive
            self._upload_json('quiz_sessions.json', remote_file['id'] if remote_file else None, merged_sessions_data)
            
            return True, "Đồng bộ Sessions thành công"
            
        except Exception as e:
            print(f"Sync sessions error: {e}")
            return False, f"Lỗi: {e}"

    def perform_full_sync(self) -> Tuple[bool, str]:
        if not self.auth_service.is_logged_in():
            return False, "Chưa đăng nhập Google Drive"
            
        success1, msg1 = self.sync_decks()
        if not success1:
            return False, msg1
            
        success2, msg2 = self.sync_quiz_sessions()
        if not success2:
            return False, msg2
            
        return True, "Đồng bộ thành công"
