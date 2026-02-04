"""
PalmPlay - FastAPI Backend Server
Handles music playback, gesture detection, and serves the web frontend.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import base64
import asyncio
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
import pygame
from collections import deque
import time

# MediaPipe imports
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Mutagen for cover art
try:
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, APIC
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False

app = FastAPI(title="PalmPlay API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
class MusicPlayer:
    def __init__(self):
        try:
            pygame.mixer.init()
        except Exception as e:
            print(f"Mixer init error: {e}")
        self.tracks = []
        self.current_idx = 0
        self.is_playing = False
        self.volume = 50
        self.shuffle = False
        self.repeat = False
        self.music_folder = None
        self.start_time_offset = 0
        self._cached_safe_tracks = []
        self._last_tracks_hash = 0
        
    def load_folder(self, folder_path, append=False):
        if not append:
            self.tracks = []
        
        self.music_folder = folder_path
        if os.path.isdir(folder_path):
            print(f"Scanning folder: {folder_path}")
            # Support multiple formats
            valid_extensions = ('.mp3', '.wav', '.ogg', '.m4a', '.flac')
            for f in sorted(os.listdir(folder_path)):
                if f.lower().endswith(valid_extensions):
                    full_path = os.path.join(folder_path, f)
                    metadata = {
                        'name': os.path.splitext(f)[0],
                        'path': full_path,
                        'filename': f,
                        'artist': 'Unknown Artist',
                        'album': 'Unknown Album',
                        'year': 'Unknown Year',
                        'duration': '0:00',
                        'duration_sec': 0
                    }
                    
                    if HAS_MUTAGEN:
                        try:
                            from mutagen import File
                            audio = File(full_path)
                            
                            if audio is not None:
                                # Duration
                                if hasattr(audio.info, 'length'):
                                    duration_sec = int(audio.info.length)
                                    mins = duration_sec // 60
                                    secs = duration_sec % 60
                                    metadata['duration'] = f"{mins}:{secs:02d}"
                                    metadata['duration_sec'] = duration_sec
                                
                                # Tags
                                if audio.tags:
                                    tags = audio.tags
                                    # Handle different tag formats
                                    if 'TPE1' in tags: metadata['artist'] = str(tags['TPE1'])
                                    elif 'artist' in tags: metadata['artist'] = str(tags['artist'][0])
                                    
                                    if 'TALB' in tags: metadata['album'] = str(tags['TALB'])
                                    elif 'album' in tags: metadata['album'] = str(tags['album'][0])
                                    
                                    if 'TDRC' in tags: metadata['year'] = str(tags['TDRC'])[:4]
                                    elif 'TYER' in tags: metadata['year'] = str(tags['TYER'])[:4]
                                    elif 'date' in tags: metadata['year'] = str(tags['date'][0])[:4]
                                    
                        except Exception as e:
                            print(f"Error reading metadata for {f}: {e}")
                            
                    self.tracks.append(metadata)
        
        self._update_cache()
        print(f"Loaded {len(self.tracks)} tracks total")
        return len(self.tracks)
    
    def _update_cache(self):
        """Update the cached metadata for faster state transfers"""
        self._cached_safe_tracks = []
        for t in self.tracks:
            self._cached_safe_tracks.append({
                'name': t.get('name', 'Unknown'), 
                'filename': t.get('filename', 'unknown.mp3'),
                'artist': t.get('artist', 'Unknown Artist'),
                'album': t.get('album', 'Unknown Album'),
                'year': t.get('year', 'Unknown Year'),
                'duration': t.get('duration', '0:00'),
                'duration_sec': t.get('duration_sec', 0)
            })
        self._last_tracks_hash = len(self.tracks) # Simple hash for now
    
    def add_files(self, file_paths):
        """Add individual audio files to the playlist"""
        added_count = 0
        valid_extensions = ('.mp3', '.wav', '.ogg', '.m4a', '.flac')
        for file_path in file_paths:
            if os.path.isfile(file_path) and file_path.lower().endswith(valid_extensions):
                filename = os.path.basename(file_path)
                name = os.path.splitext(filename)[0]
                
                metadata = {
                    'path': file_path,
                    'name': name,
                    'filename': filename,
                    'artist': 'Unknown Artist',
                    'album': 'Unknown Album',
                    'year': 'Unknown Year',
                    'duration': '0:00',
                    'duration_sec': 0
                }
                
                if HAS_MUTAGEN:
                    try:
                        from mutagen import File
                        audio = File(file_path)
                        if audio is not None:
                            if hasattr(audio.info, 'length'):
                                duration_sec = int(audio.info.length)
                                metadata['duration_sec'] = duration_sec
                                metadata['duration'] = f"{duration_sec // 60}:{duration_sec % 60:02d}"
                            
                            if audio.tags:
                                tags = audio.tags
                                if 'TPE1' in tags: metadata['artist'] = str(tags['TPE1'])
                                elif 'artist' in tags: metadata['artist'] = str(tags['artist'][0])
                                if 'TALB' in tags: metadata['album'] = str(tags['TALB'])
                                elif 'album' in tags: metadata['album'] = str(tags['album'][0])
                    except Exception as e:
                        print(f"Error reading metadata for {file_path}: {e}")
                
                self.tracks.append(metadata)
                added_count += 1
        
        if added_count > 0:
            self._update_cache()
        return added_count

    def remove_track(self, idx):
        if 0 <= idx < len(self.tracks):
            if idx == self.current_idx:
                try:
                    pygame.mixer.music.stop()
                    pygame.mixer.music.unload()
                except:
                    pass
                self.is_playing = False
                self.tracks.pop(idx)
                if self.tracks:
                    self.current_idx = self.current_idx % len(self.tracks)
                else:
                    self.current_idx = -1
            else:
                self.tracks.pop(idx)
                if idx < self.current_idx:
                    self.current_idx -= 1
            self._update_cache()
            return True
        return False

    def play_track(self, idx):
        if not self.tracks or idx < 0 or idx >= len(self.tracks):
            print(f"Invalid track index: {idx}")
            return False
            
        try:
            track = self.tracks[idx]
            pygame.mixer.music.stop()
            pygame.mixer.music.load(track['path'])
            pygame.mixer.music.set_volume(self.volume / 100.0)
            pygame.mixer.music.play()
            self.current_idx = idx
            self.is_playing = True
            self.start_time_offset = 0
            print(f"Playing [{idx}]: {track['name']}")
            return True
        except Exception as e:
            print(f"Play Error: {e}")
            return False

    def toggle_play(self):
        if not self.tracks:
            return False
            
        if self.is_playing:
            pygame.mixer.music.pause()
            self.is_playing = False
        else:
            if not pygame.mixer.music.get_busy() or self.current_idx == -1:
                # If nothing was playing or reset, play current or first
                idx = max(0, self.current_idx)
                self.play_track(idx)
            else:
                pygame.mixer.music.unpause()
                self.is_playing = True
        return self.is_playing

    def next_track(self):
        if not self.tracks:
            return False
            
        if self.shuffle and len(self.tracks) > 1:
            import random
            next_idx = self.current_idx
            while next_idx == self.current_idx:
                next_idx = random.randint(0, len(self.tracks) - 1)
        else:
            next_idx = (self.current_idx + 1) % len(self.tracks)
            
        return self.play_track(next_idx)

    def prev_track(self):
        if not self.tracks:
            return False
            
        prev_idx = (self.current_idx - 1) % len(self.tracks)
        return self.play_track(prev_idx)

    def set_volume(self, vol):
        self.volume = max(0, min(100, vol))
        try:
            pygame.mixer.music.set_volume(self.volume / 100.0)
        except:
            pass
        return self.volume

    def seek(self, seconds):
        if not self.tracks or self.current_idx < 0:
            return False
            
        try:
            track = self.tracks[self.current_idx]
            # Restart with start=pos
            pygame.mixer.music.load(track['path'])
            pygame.mixer.music.set_volume(self.volume / 100.0)
            pygame.mixer.music.play(start=seconds)
            self.is_playing = True
            self.start_time_offset = seconds
            return True
        except Exception as e:
            print(f"Seek Error: {e}")
            return False

    def get_state(self):
        current_track = None
        if self.tracks and 0 <= self.current_idx < len(self.tracks):
            current_track = self.tracks[self.current_idx]
        
        # Get Current Position
        pos_ms = pygame.mixer.music.get_pos()
        # pos_ms returns time since last play() call in ms
        position_sec = self.start_time_offset
        if pos_ms >= 0:
            position_sec += pos_ms / 1000.0

        # Auto-update playing state and handle track end
        is_actually_playing = pygame.mixer.music.get_busy()
        
        # When track ends: pos_ms becomes -1 and get_busy() becomes false
        # ONLY trigger if we WERE playing (self.is_playing is True)
        if self.is_playing and not is_actually_playing and pos_ms == -1:
            if self.current_idx != -1:
                print(f"Track ended: {current_track['name'] if current_track else 'Unknown'}")
                if self.repeat:
                    self.play_track(self.current_idx)
                else:
                    self.next_track()
            
            # Update state for immediate return
            pos_ms = pygame.mixer.music.get_pos()
            position_sec = self.start_time_offset
            if pos_ms >= 0:
                position_sec += pos_ms / 1000.0
            if self.tracks and 0 <= self.current_idx < len(self.tracks):
                current_track = self.tracks[self.current_idx]

        return {
            'tracks': self._cached_safe_tracks,
            'current_idx': self.current_idx,
            'current_track': current_track['name'] if current_track else None,
            'is_playing': self.is_playing,
            'volume': self.volume,
            'shuffle': self.shuffle,
            'repeat': self.repeat,
            'position': position_sec,
            'duration': current_track.get('duration_sec', 0) if current_track else 0
        }

# Gesture Recognizer
class GestureRecognizer:
    def __init__(self):
        self.center_buf = deque(maxlen=6)
        self.finger_buf = deque(maxlen=6)
        self.last_trigger = {}
        self.cooldown = 1.0
        
    def fingers_up(self, lm):
        tips = [8, 12, 16, 20]
        count = 0
        for tip in tips:
            try:
                if lm[tip][1] < lm[tip - 2][1]:
                    count += 1
            except:
                pass
        try:
            if abs(lm[4][0] - lm[0][0]) > 0.06:
                count += 1
        except:
            pass
        return count
    
    def cooldown_ok(self, action):
        t = time.time()
        last = self.last_trigger.get(action, 0)
        if t - last >= self.cooldown:
            self.last_trigger[action] = t
            return True
        return False
    
    def recognize(self, landmarks):
        if not landmarks:
            return None
        
        lm = landmarks
        raw_cnt = self.fingers_up(lm)
        self.finger_buf.append(raw_cnt)
        cnt = int(round(np.median(list(self.finger_buf))))
        
        # Check finger states
        thumb_up = lm[4][1] < lm[3][1]
        idx_up = lm[8][1] < lm[6][1]
        mid_up = lm[12][1] < lm[10][1]
        ring_up = lm[16][1] < lm[14][1]
        pinky_up = lm[20][1] < lm[18][1]
        
        # Open palm -> Shuffle
        if cnt >= 5 and idx_up and mid_up and ring_up and pinky_up and thumb_up:
            if self.cooldown_ok('shuffle'):
                return 'shuffle'
        
        # Thumb up -> Repeat
        if thumb_up and not idx_up and not mid_up and not ring_up and not pinky_up:
            if lm[4][1] < lm[0][1] - 0.1:
                if self.cooldown_ok('repeat'):
                    return 'repeat'
        
        # Two fingers -> Volume
        if cnt >= 2 and idx_up and mid_up and not ring_up and not pinky_up:
            vol = int((1.0 - np.mean([lm[8][1], lm[12][1]])) * 100)
            return ('volume', max(0, min(100, vol)))
        
        # Fist
        tips = [4, 8, 12, 16, 20]
        folded = sum(1 for tip in tips if lm[tip][1] > lm[tip - 2][1])
        if folded >= 4:
            if self.cooldown_ok('toggle'):
                return 'toggle'
        
        return None

# Initialize global objects
player = MusicPlayer()
gesture_recognizer = GestureRecognizer()

# Hand detector setup
hand_detector = None
def init_hand_detector():
    global hand_detector
    model_path = os.path.abspath("hand_landmarker.task")
    if os.path.exists(model_path):
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=1,
            min_hand_detection_confidence=0.7,
            min_tracking_confidence=0.5)
        hand_detector = vision.HandLandmarker.create_from_options(options)

try:
    init_hand_detector()
except Exception as e:
    print(f"Hand detector init failed: {e}")


# API Routes
@app.get("/")
async def root():
    # Try to serve the React build if it exists, otherwise fall back to static
    react_index = os.path.join("frontend", "dist", "index.html")
    if os.path.exists(react_index):
        return FileResponse(react_index)
    return FileResponse("static/index.html")

@app.get("/api/state")
async def get_state():
    return player.get_state()

@app.post("/api/load-folder")
async def load_folder(data: dict):
    folder = data.get('folder', '')
    if os.path.isdir(folder):
        count = player.load_folder(folder)
        return {"success": True, "count": count}
    return {"success": False, "error": "Invalid folder"}

@app.post("/api/add-files")
async def add_files(data: dict):
    file_paths = data.get('files', [])
    if not file_paths:
        return {"success": False, "error": "No files provided"}
    
    count = player.add_files(file_paths)
    return {"success": True, "count": count, "state": player.get_state()}

@app.post("/api/upload-files")
async def upload_files(files: list[UploadFile] = File(...)):
    if not files:
        return {"success": False, "error": "No files uploaded"}
    
    upload_dir = os.path.join(os.path.dirname(__file__), "uploaded_music")
    os.makedirs(upload_dir, exist_ok=True)
    
    uploaded_paths = []
    valid_extensions = ('.mp3', '.wav', '.ogg', '.m4a', '.flac')
    for file in files:
        if file.filename.lower().endswith(valid_extensions):
            try:
                safe_filename = os.path.basename(file.filename)
                file_path = os.path.join(upload_dir, safe_filename)
                with open(file_path, "wb") as f:
                    content = await file.read()
                    f.write(content)
                uploaded_paths.append(file_path)
            except Exception as e:
                print(f"Error saving file {file.filename}: {e}")
    
    if uploaded_paths:
        count = player.add_files(uploaded_paths)
        return {"success": True, "count": count, "state": player.get_state()}
    
    return {"success": False, "error": "No valid audio files uploaded"}

@app.post("/api/play/{idx}")
async def play_track(idx: int):
    success = player.play_track(idx)
    return {"success": success, "state": player.get_state()}

@app.post("/api/toggle")
async def toggle_play():
    is_playing = player.toggle_play()
    return {"is_playing": is_playing}

@app.post("/api/next")
async def next_track():
    success = player.next_track()
    return {"success": success, "state": player.get_state()}

@app.delete("/api/track/{idx}")
async def delete_track(idx: int):
    success = player.remove_track(idx)
    return {"success": success, "state": player.get_state()}

@app.post("/api/prev")
async def prev_track():
    success = player.prev_track()
    return {"success": success, "state": player.get_state()}

@app.post("/api/volume/{vol}")
async def set_volume(vol: int):
    new_vol = player.set_volume(vol)
    return {"volume": new_vol}

@app.post("/api/seek/{seconds}")
async def seek_track(seconds: float):
    success = player.seek(seconds)
    return {"success": success, "state": player.get_state()}

@app.post("/api/shuffle")
async def toggle_shuffle():
    player.shuffle = not player.shuffle
    return {"shuffle": player.shuffle}

@app.post("/api/repeat")
async def toggle_repeat():
    player.repeat = not player.repeat
    return {"repeat": player.repeat}

@app.get("/api/cover/{idx}")
async def get_cover(idx: int):
    if not HAS_MUTAGEN or idx < 0 or idx >= len(player.tracks):
        return JSONResponse({"error": "Not found"}, status_code=404)
    
    try:
        from mutagen import File
        audio = File(player.tracks[idx]['path'])
        if audio and audio.tags:
            for tag_name in audio.tags:
                if 'APIC' in tag_name:
                    tag = audio.tags[tag_name]
                    return Response(content=tag.data, media_type=tag.mime)
                elif tag_name == 'covr':
                    return Response(content=audio.tags[tag_name][0], media_type='image/jpeg')
    except Exception as e:
        print(f"Cover error: {e}")
    
    return JSONResponse({"error": "No cover"}, status_code=404)

@app.post("/api/detect-gesture")
def detect_gesture(file: UploadFile = File(...)):
    if hand_detector is None:
        return {"gesture": None, "error": "Hand detector not initialized"}
    
    try:
        # Use synchronous read since we're in a thread pool now
        contents = file.file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None: return {"gesture": None}
        
        # Performance optimization: Resize frame if too large
        h, w = frame.shape[:2]
        if w > 640:
            scale = 640 / w
            frame = cv2.resize(frame, (0,0), fx=scale, fy=scale)
            
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = hand_detector.detect(mp_image)
        
        if result.hand_landmarks:
            landmarks = [(lm.x, lm.y, lm.z) for lm in result.hand_landmarks[0]]
            gesture = gesture_recognizer.recognize(landmarks)
            if gesture:
                if gesture == 'toggle':
                    player.toggle_play()
                    return {"gesture": "toggle", "action": "play/pause"}
                elif gesture == 'shuffle':
                    player.shuffle = not player.shuffle
                    return {"gesture": "shuffle", "value": player.shuffle}
                elif gesture == 'repeat':
                    player.repeat = not player.repeat
                    return {"gesture": "repeat", "value": player.repeat}
                elif isinstance(gesture, tuple) and gesture[0] == 'volume':
                    player.set_volume(gesture[1])
                    return {"gesture": "volume", "value": gesture[1]}
        return {"gesture": None}
    except Exception as e:
        print(f"Gesture error: {e}")
        return {"gesture": None, "error": str(e)}

# Serve the React production build
dist_path = os.path.join("frontend", "dist")
if os.path.exists(dist_path):
    # Mount the whole dist folder for root assets (vite.svg, etc.)
    # Note: This is mounted LAST so API routes take priority
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
else:
    app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Load both local and uploaded music on startup
    cwd = os.getcwd()
    for folder in ["local_music", "uploaded_music"]:
        folder_path = os.path.join(cwd, folder)
        if os.path.exists(folder_path):
            print(f"Initializing music from: {folder_path}")
            player.load_folder(folder_path, append=True)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
