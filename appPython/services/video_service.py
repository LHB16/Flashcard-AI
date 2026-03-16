"""
services/video_service.py - Extracts frames from video files for Gemini processing.
"""
import os
import cv2

class VideoService:
    @staticmethod
    def extract_frames(video_path: str, output_dir: str, fps: float = 1.0, on_progress=None) -> list:
        """
        Extracts frames from a video at the specified fps.
        Returns a list of saved image file paths.
        """
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"Cannot open video file: {video_path}")
            
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        if video_fps <= 0:
            video_fps = 30.0
            
        frame_interval = max(1, int(video_fps / fps))
        
        extracted_files = []
        frame_count = 0
        saved_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_count % frame_interval == 0:
                out_path = os.path.join(output_dir, f"frame_{saved_count:04d}.jpg")
                cv2.imwrite(out_path, frame)
                extracted_files.append(out_path)
                saved_count += 1
                if on_progress:
                    on_progress(saved_count)
                    
            frame_count += 1
            
        cap.release()
        return extracted_files
