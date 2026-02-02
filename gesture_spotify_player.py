"""
Gesture-controlled music player using OpenCV + MediaPipe + Spotipy.

Controls (default mapping):
- Fist (no fingers) -> toggle play/pause
- Swipe right -> next track
- Swipe left -> previous track
- Two fingers up -> volume control by vertical position (higher = louder)

Requirements: opencv-python, mediapipe, spotipy, pycaw (optional for system volume), pygame

Before running set SPOTIPY_CLIENT_ID, SPOTIPY_CLIENT_SECRET and SPOTIPY_REDIRECT_URI as env vars
or edit the script to provide them directly (not recommended for security).

Run locally (Windows recommended):
python gesture_spotify_player.py

"""

import os
import time
import argparse
from collections import deque
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import cv2
import numpy as np
import math
import tkinter as tk
from tkinter import filedialog

try:
    import mediapipe as mp
    # Check for Tasks API
    import mediapipe.tasks.python
except Exception:
    raise RuntimeError("mediapipe (with Tasks API) is required: pip install mediapipe")

try:
    import pygame
except Exception:
    pygame = None

# spotipy is optional (we currently run local-only). If you later add it, the code will try to use it.
try:
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth
except Exception:
    spotipy = None

try:
    # pycaw is optional and Windows-only. Use to set system volume if desired.
    from ctypes import POINTER, cast
    from comtypes import CLSCTX_ALL
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
    _has_pycaw = True
except Exception:
    _has_pycaw = False


### --- Utilities ----------------------------------------------------------------

def now():
    return time.time()


### --- Hand Detector -------------------------------------------------------------

class HandDetector:
    """Wrapper around MediaPipe Higher-Level Tasks API."""
    def __init__(self, max_num_hands=1, detection_conf=0.7, tracking_conf=0.5):
        # New API imports inside class to implicitely handle dependency
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
        
        # Use absolute path to avoid permission/not found errors
        model_path = os.path.abspath("hand_landmarker.task")
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=max_num_hands,
            min_hand_detection_confidence=detection_conf,
            min_tracking_confidence=tracking_conf)
        self.detector = vision.HandLandmarker.create_from_options(options)
        # self.mp_draw = mp.solutions.drawing_utils
        # self.mp_hands = mp.solutions.hands

    def find_hands(self, frame, draw=True):
        # frame: BGR image
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        detection_result = self.detector.detect(mp_image)
        
        hands_data = []
        # detection_result.hand_landmarks is a list of lists of landmarks
        if detection_result.hand_landmarks:
            for hand_landmarks in detection_result.hand_landmarks:
                lm = []
                # Convert NormalizedLandmark objects to tuples
                for lm_pt in hand_landmarks:
                    lm.append((lm_pt.x, lm_pt.y, lm_pt.z))
                
                # compute center
                cx = int(np.mean([p[0] for p in lm]) * w)
                cy = int(np.mean([p[1] for p in lm]) * h)
                
                hands_data.append({
                    'lm': lm,
                    'center': (cx, cy),
                    'raw': hand_landmarks # This is now a list of objects, not a protobuf
                })
                
                if draw:
                    # Drawing is trickier since we don't have the protobuf formatted object exactly as 'solutions' expected
                    # But we can reconstruct a proto-like structure or just draw manually. 
                    # The easiest way using mp_draw requires a proto. 
                    # For now, let's draw strictly the points and lines manually to avoid dependency on missing `solutions` components.
                    
                    # Draw points
                    for p in lm:
                        cv2.circle(frame, (int(p[0]*w), int(p[1]*h)), 5, (255, 0, 255), cv2.FILLED)
                    
                    # Draw connections (manual definition since mp.solutions.hands might be missing)
                    connections = [
                        (0,1), (1,2), (2,3), (3,4),         # Thumb
                        (0,5), (5,6), (6,7), (7,8),         # Index
                        (5,9), (9,10), (10,11), (11,12),    # Middle
                        (9,13), (13,14), (14,15), (15,16),  # Ring
                        (13,17), (17,18), (18,19), (19,20), # Pinky
                        (0,17)                              # Palm base
                    ]
                    for p1_idx, p2_idx in connections:
                        x1, y1 = int(lm[p1_idx][0]*w), int(lm[p1_idx][1]*h)
                        x2, y2 = int(lm[p2_idx][0]*w), int(lm[p2_idx][1]*h)
                        cv2.line(frame, (x1, y1), (x2, y2), (255, 255, 255), 2)
                        
        return frame, hands_data


### --- Gesture Recognizer -------------------------------------------------------

class GestureRecognizer:
    """Recognize gestures robustly: fist, two fingers up, swipes based on recent centers.

    Uses timestamped center buffer to compute swipe velocity, smoothing for finger counts,
    and cooldowns to avoid repeated triggers. Tweak parameters below for sensitivity.
    """

    def __init__(self, buffer_len=6, swipe_vpx=450.0, cooldown=0.9):
        # center buffer stores tuples (x, y, t)
        self.center_buf = deque(maxlen=buffer_len)
        self.finger_buf = deque(maxlen=buffer_len)
        self.last_trigger = {}
        self.swipe_vpx = swipe_vpx  # pixels per second threshold
        self.cooldown = cooldown

    def fingers_up(self, lm):
        # lm: list of (x,y,z) normalized
        # Simple heuristic per finger (index->pinky): tip y < pip y => finger up
        tips = [8, 12, 16, 20]
        count = 0
        for tip in tips:
            try:
                if lm[tip][1] < lm[tip - 2][1]:
                    count += 1
            except Exception:
                pass
        # thumb: check if thumb tip is away from palm center horizontally
        try:
            # approximate palm center as wrist (0)
            if abs(lm[4][0] - lm[0][0]) > 0.06:
                count += 1
        except Exception:
            pass
        return count

    def smooth_count(self, cnt):
        self.finger_buf.append(cnt)
        return int(round(np.median(list(self.finger_buf))))

    def add_center(self, center):
        # center is (x_px, y_px)
        self.center_buf.append((center[0], center[1], time.time()))

    def detect_swipe(self):
        if len(self.center_buf) < 3:
            return None
        x0, y0, t0 = self.center_buf[0]
        x1, y1, t1 = self.center_buf[-1]
        dt = max(1e-3, t1 - t0)
        vx = (x1 - x0) / dt
        # require significant horizontal velocity and not too much vertical drift
        vy = (y1 - y0) / dt
        # tuned: require horizontal speed > threshold and vertical drift smaller than half horizontal
        if abs(vx) > self.swipe_vpx and abs(vy) < abs(vx) * 0.5:
            return 'right' if vx > 0 else 'left'
        return None

    def cooldown_ok(self, action):
        t = time.time()
        last = self.last_trigger.get(action, 0)
        if t - last >= self.cooldown:
            self.last_trigger[action] = t
            return True
        return False

    def recognize(self, hand):
        if not hand:
            # no hand detected
            return None, None
        lm = hand['lm']
        center = hand['center']
        self.add_center(center)
        raw_cnt = self.fingers_up(lm)
        cnt = self.smooth_count(raw_cnt)

        # Check specific finger states
        thumb_up = lm[4][1] < lm[3][1]  # Thumb tip above thumb IP
        idx_up = lm[8][1] < lm[6][1]
        mid_up = lm[12][1] < lm[10][1]
        ring_up = lm[16][1] < lm[14][1]
        pinky_up = lm[20][1] < lm[18][1]

        # Open Palm (5 fingers) -> Shuffle
        if cnt >= 5 and idx_up and mid_up and ring_up and pinky_up and thumb_up:
            return 'open_palm', None

        # Thumb Up (only thumb extended) -> Repeat
        if thumb_up and not idx_up and not mid_up and not ring_up and not pinky_up:
            # Verify thumb is clearly up (above wrist level)
            if lm[4][1] < lm[0][1] - 0.1:
                return 'thumb_up', None

        # Two-finger volume gesture: index + middle up, ring & pinky down
        if cnt >= 2:
            if idx_up and mid_up and not ring_up and not pinky_up:
                # volume by average vertical position of index and middle tips
                vol_norm = 1.0 - np.mean([lm[8][1], lm[12][1]])
                vol = int(np.clip(vol_norm * 100, 0, 100))
                return 'volume', vol

        # Fist detection: all finger tips are near the wrist or folded (tips below pip)
        tips = [4, 8, 12, 16, 20]
        folded = 0
        for tip in tips:
            try:
                if lm[tip][1] > lm[tip - 2][1]:
                    folded += 1
            except Exception:
                pass
        if folded >= 4:
            return 'fist', None

        # Swipe detection
        swipe = self.detect_swipe()
        if swipe == 'right':
            return 'swipe_right', None
        elif swipe == 'left':
            return 'swipe_left', None

        return None, None


### --- Spotify Controller -------------------------------------------------------

class SpotifyController:
    """Controls playback via Spotipy. Requires SPOTIPY_CLIENT_ID, SPOTIPY_CLIENT_SECRET, SPOTIPY_REDIRECT_URI as env vars or will prompt."""

    def __init__(self, scope='user-modify-playback-state user-read-playback-state user-read-currently-playing'):
        if spotipy is None:
            raise RuntimeError('spotipy is not installed')
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
        redirect_uri = os.environ.get('SPOTIPY_REDIRECT_URI')
        if not (client_id and client_secret and redirect_uri):
            print('Spotify credentials not found in env. You will be prompted to login via a URL.')
        # Create SpotifyOAuth; spotipy will open a local server for redirect when possible
        self.auth_manager = SpotifyOAuth(scope=scope)
        self.sp = spotipy.Spotify(auth_manager=self.auth_manager)

    def is_available(self):
        try:
            cur = self.sp.current_playback()
            # If API works but no device, return True (we can still issue playback requests)
            return cur is not None
        except Exception:
            return False

    def toggle_play_pause(self):
        try:
            cur = self.sp.current_playback()
            if cur and cur.get('is_playing'):
                self.sp.pause_playback()
            else:
                # start playback on user's active device
                self.sp.start_playback()
            return True
        except Exception as e:
            print('Spotify play/pause error:', e)
            return False

    def next(self):
        try:
            self.sp.next_track()
            return True
        except Exception as e:
            print('Spotify next error:', e)
            return False

    def previous(self):
        try:
            self.sp.previous_track()
            return True
        except Exception as e:
            print('Spotify prev error:', e)
            return False

    def set_volume(self, vol_percent):
        try:
            self.sp.volume(vol_percent)
            return True
        except Exception as e:
            print('Spotify set volume error:', e)
            return False

    def currently_playing(self):
        try:
            cur = self.sp.current_playback()
            if cur and cur.get('item'):
                return f"{cur['item']['name']} - {', '.join([a['name'] for a in cur['item']['artists']])}"
            return None
        except Exception:
            return None


### --- Local Controller (fallback) ---------------------------------------------

class LocalController:
    def __init__(self, music_folder='local_music'):
        if pygame is None:
            raise RuntimeError('pygame is required for local playback')
        pygame.mixer.init()
        self.music_folder = music_folder
        self.track_paths = []
        if os.path.isdir(music_folder):
            for f in os.listdir(music_folder):
                if f.lower().endswith(('.mp3', '.wav', '.ogg')):
                    self.track_paths.append(os.path.join(music_folder, f))
        self.idx = 0
        self.paused = True
        self.volume = 0.5
        self.shuffle = False
        self.repeat = False  # 0=off, 1=repeat all, 2=repeat one
        self.shuffle_order = list(range(len(self.track_paths)))
        self.start_time = 0  # Track playback start time
        self.pause_offset = 0  # Time when paused
        pygame.mixer.music.set_volume(self.volume)
        if self.track_paths:
            pygame.mixer.music.load(self.track_paths[self.idx])

    def is_available(self):
        return len(self.track_paths) > 0

    def get_track_names(self):
        """Return list of track basenames."""
        return [os.path.basename(p) for p in self.track_paths]

    def toggle_play_pause(self):
        if not self.track_paths:
            return False
        if pygame.mixer.music.get_busy() and not self.paused:
            pygame.mixer.music.pause()
            self.pause_offset = time.time() - self.start_time
            self.paused = True
        else:
            if self.paused and self.pause_offset > 0:
                pygame.mixer.music.unpause()
                self.start_time = time.time() - self.pause_offset
                self.paused = False
            else:
                pygame.mixer.music.play()
                self.start_time = time.time()
                self.paused = False
        return True

    def play_track(self, index):
        """Play a specific track by index."""
        if not self.track_paths or index < 0 or index >= len(self.track_paths):
            return False
        self.idx = index
        pygame.mixer.music.load(self.track_paths[self.idx])
        pygame.mixer.music.play()
        self.start_time = time.time()
        self.pause_offset = 0
        self.paused = False
        return True

    def next(self):
        if not self.track_paths:
            return False
        if self.shuffle:
            import random
            self.idx = random.randint(0, len(self.track_paths) - 1)
        else:
            self.idx = (self.idx + 1) % len(self.track_paths)
        pygame.mixer.music.load(self.track_paths[self.idx])
        pygame.mixer.music.play()
        self.start_time = time.time()
        self.pause_offset = 0
        self.paused = False
        return True

    def previous(self):
        if not self.track_paths:
            return False
        self.idx = (self.idx - 1) % len(self.track_paths)
        pygame.mixer.music.load(self.track_paths[self.idx])
        pygame.mixer.music.play()
        self.start_time = time.time()
        self.pause_offset = 0
        self.paused = False
        return True

    def set_volume(self, vol_percent):
        v = max(0, min(100, vol_percent)) / 100.0
        self.volume = v
        pygame.mixer.music.set_volume(self.volume)
        return True

    def toggle_shuffle(self):
        self.shuffle = not self.shuffle
        return self.shuffle

    def toggle_repeat(self):
        self.repeat = not self.repeat
        return self.repeat

    def get_elapsed_time(self):
        """Get elapsed playback time in seconds."""
        if self.paused:
            return self.pause_offset
        elif self.start_time > 0:
            return time.time() - self.start_time
        return 0

    def currently_playing(self):
        if not self.track_paths:
            return None
        return os.path.basename(self.track_paths[self.idx])


### --- Main app -----------------------------------------------------------------

# --- macOS-Style UI Drawing Functions ---

def draw_rounded_rect(frame, pt1, pt2, color, radius, thickness=-1):
    """Draw a rectangle with rounded corners."""
    x1, y1 = pt1
    x2, y2 = pt2
    
    # Clamp radius
    radius = min(radius, abs(x2 - x1) // 2, abs(y2 - y1) // 2)
    
    if thickness == -1:  # Filled
        # Draw filled rectangles and circles for rounded corners
        cv2.rectangle(frame, (x1 + radius, y1), (x2 - radius, y2), color, -1)
        cv2.rectangle(frame, (x1, y1 + radius), (x2, y2 - radius), color, -1)
        cv2.circle(frame, (x1 + radius, y1 + radius), radius, color, -1)
        cv2.circle(frame, (x2 - radius, y1 + radius), radius, color, -1)
        cv2.circle(frame, (x1 + radius, y2 - radius), radius, color, -1)
        cv2.circle(frame, (x2 - radius, y2 - radius), radius, color, -1)
    else:  # Outline
        cv2.line(frame, (x1 + radius, y1), (x2 - radius, y1), color, thickness)
        cv2.line(frame, (x1 + radius, y2), (x2 - radius, y2), color, thickness)
        cv2.line(frame, (x1, y1 + radius), (x1, y2 - radius), color, thickness)
        cv2.line(frame, (x2, y1 + radius), (x2, y2 - radius), color, thickness)
        cv2.ellipse(frame, (x1 + radius, y1 + radius), (radius, radius), 180, 0, 90, color, thickness)
        cv2.ellipse(frame, (x2 - radius, y1 + radius), (radius, radius), 270, 0, 90, color, thickness)
        cv2.ellipse(frame, (x1 + radius, y2 - radius), (radius, radius), 90, 0, 90, color, thickness)
        cv2.ellipse(frame, (x2 - radius, y2 - radius), (radius, radius), 0, 0, 90, color, thickness)


def draw_play_icon(frame, center, size, color=(255, 255, 255)):
    """Draw a play triangle icon."""
    cx, cy = center
    pts = np.array([
        [cx - size//3, cy - size//2],
        [cx - size//3, cy + size//2],
        [cx + size//2, cy]
    ], np.int32)
    cv2.fillPoly(frame, [pts], color)


def draw_pause_icon(frame, center, size, color=(255, 255, 255)):
    """Draw a pause icon (two vertical bars)."""
    cx, cy = center
    bar_w = size // 5
    gap = size // 4
    # Left bar
    cv2.rectangle(frame, (cx - gap - bar_w, cy - size//2), (cx - gap, cy + size//2), color, -1)
    # Right bar
    cv2.rectangle(frame, (cx + gap, cy - size//2), (cx + gap + bar_w, cy + size//2), color, -1)


def draw_skip_forward_icon(frame, center, size, color=(255, 255, 255)):
    """Draw skip forward icon (two triangles + bar)."""
    cx, cy = center
    tri_size = size // 2
    # First triangle
    pts1 = np.array([
        [cx - size//2, cy - tri_size],
        [cx - size//2, cy + tri_size],
        [cx, cy]
    ], np.int32)
    cv2.fillPoly(frame, [pts1], color)
    # Second triangle
    pts2 = np.array([
        [cx, cy - tri_size],
        [cx, cy + tri_size],
        [cx + size//2, cy]
    ], np.int32)
    cv2.fillPoly(frame, [pts2], color)
    # End bar
    cv2.rectangle(frame, (cx + size//2, cy - tri_size), (cx + size//2 + 4, cy + tri_size), color, -1)


def draw_skip_back_icon(frame, center, size, color=(255, 255, 255)):
    """Draw skip back icon (bar + two triangles pointing left)."""
    cx, cy = center
    tri_size = size // 2
    # Start bar
    cv2.rectangle(frame, (cx - size//2 - 4, cy - tri_size), (cx - size//2, cy + tri_size), color, -1)
    # First triangle (pointing left)
    pts1 = np.array([
        [cx, cy - tri_size],
        [cx, cy + tri_size],
        [cx - size//2, cy]
    ], np.int32)
    cv2.fillPoly(frame, [pts1], color)
    # Second triangle
    pts2 = np.array([
        [cx + size//2, cy - tri_size],
        [cx + size//2, cy + tri_size],
        [cx, cy]
    ], np.int32)
    cv2.fillPoly(frame, [pts2], color)


def draw_volume_icon(frame, center, size, vol_level, color=(255, 255, 255)):
    """Draw a speaker icon with volume arcs."""
    cx, cy = center
    # Speaker body
    pts = np.array([
        [cx - size//3, cy - size//6],
        [cx - size//3, cy + size//6],
        [cx - size//6, cy + size//6],
        [cx + size//6, cy + size//3],
        [cx + size//6, cy - size//3],
        [cx - size//6, cy - size//6],
    ], np.int32)
    cv2.fillPoly(frame, [pts], color)
    # Volume arcs based on level
    if vol_level > 30:
        cv2.ellipse(frame, (cx + size//4, cy), (size//6, size//4), 0, -60, 60, color, 2)
    if vol_level > 60:
        cv2.ellipse(frame, (cx + size//4, cy), (size//3, size//2), 0, -60, 60, color, 2)


def create_glassmorphism_overlay(frame, y_start, height, alpha=0.6):
    """Create a semi-transparent overlay with blur effect."""
    h, w = frame.shape[:2]
    overlay = frame.copy()
    # Dark semi-transparent background
    cv2.rectangle(overlay, (0, y_start), (w, y_start + height), (30, 30, 35), -1)
    # Blend with original
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    # Add subtle top border
    cv2.line(frame, (0, y_start), (w, y_start), (80, 80, 90), 1)


def draw_modern_overlay(frame, track_name, vol=None, action_icon=None, action_time=0, is_playing=False):
    """Draw a modern macOS-style overlay."""
    h, w = frame.shape[:2]
    
    # Bottom control bar (glassmorphism style)
    bar_height = 80
    create_glassmorphism_overlay(frame, h - bar_height, bar_height, alpha=0.7)
    
    # Track name with modern font
    if track_name:
        # Truncate long names
        display_name = track_name[:40] + '...' if len(track_name) > 40 else track_name
        text_size = cv2.getTextSize(display_name, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
        text_x = (w - text_size[0]) // 2
        cv2.putText(frame, display_name, (text_x, h - bar_height + 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    
    # Playback controls (centered at bottom)
    control_y = h - 25
    control_spacing = 50
    center_x = w // 2
    
    # Skip back
    draw_skip_back_icon(frame, (center_x - control_spacing, control_y), 24, (180, 180, 180))
    # Play/Pause
    if is_playing:
        draw_pause_icon(frame, (center_x, control_y), 28, (255, 255, 255))
    else:
        draw_play_icon(frame, (center_x, control_y), 28, (255, 255, 255))
    # Skip forward
    draw_skip_forward_icon(frame, (center_x + control_spacing, control_y), 24, (180, 180, 180))
    
    # Volume indicator (right side)
    if vol is not None:
        vol_x = w - 100
        vol_y = h - bar_height + 50
        draw_volume_icon(frame, (vol_x - 30, vol_y), 20, vol, (180, 180, 180))
        # Volume bar with rounded ends
        bar_x = vol_x
        bar_w = 70
        bar_h = 6
        # Background
        draw_rounded_rect(frame, (bar_x, vol_y - bar_h//2), (bar_x + bar_w, vol_y + bar_h//2), 
                         (60, 60, 65), bar_h//2)
        # Fill
        fill_w = int(bar_w * (vol / 100))
        if fill_w > 0:
            draw_rounded_rect(frame, (bar_x, vol_y - bar_h//2), (bar_x + fill_w, vol_y + bar_h//2), 
                             (100, 200, 100), bar_h//2)
    
    # Action icon overlay (appears in center when action triggered)
    current_time = time.time()
    if action_icon and (current_time - action_time) < 1.0:
        # Fade out effect
        alpha = max(0, 1.0 - (current_time - action_time))
        icon_size = 80
        icon_center = (w // 2, h // 2 - 50)
        
        # Semi-transparent circle background
        overlay = frame.copy()
        cv2.circle(overlay, icon_center, icon_size, (40, 40, 45), -1)
        cv2.addWeighted(overlay, alpha * 0.7, frame, 1 - alpha * 0.7, 0, frame)
        
        # Draw appropriate icon
        icon_color = (int(255 * alpha), int(255 * alpha), int(255 * alpha))
        if action_icon == 'play':
            draw_play_icon(frame, icon_center, icon_size - 20, icon_color)
        elif action_icon == 'pause':
            draw_pause_icon(frame, icon_center, icon_size - 20, icon_color)
        elif action_icon == 'next':
            draw_skip_forward_icon(frame, icon_center, icon_size - 20, icon_color)
        elif action_icon == 'prev':
            draw_skip_back_icon(frame, icon_center, icon_size - 20, icon_color)
        elif action_icon == 'volume':
            draw_volume_icon(frame, icon_center, icon_size - 20, vol or 50, icon_color)
        elif action_icon == 'shuffle':
            # Draw shuffle icon (two crossing arrows)
            cv2.putText(frame, "SHUFFLE", (icon_center[0] - 50, icon_center[1] + 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, icon_color, 2)
        elif action_icon == 'repeat':
            # Draw repeat icon
            cv2.putText(frame, "REPEAT", (icon_center[0] - 45, icon_center[1] + 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, icon_color, 2)


def draw_shuffle_icon(frame, center, size, active=False):
    """Draw shuffle icon (crossing arrows)."""
    cx, cy = center
    color = (100, 200, 100) if active else (150, 150, 150)
    # Draw two crossing lines with arrows
    cv2.line(frame, (cx - size//3, cy - size//4), (cx + size//3, cy + size//4), color, 2)
    cv2.line(frame, (cx - size//3, cy + size//4), (cx + size//3, cy - size//4), color, 2)
    # Arrow heads
    cv2.line(frame, (cx + size//3 - 4, cy + size//4 - 4), (cx + size//3, cy + size//4), color, 2)
    cv2.line(frame, (cx + size//3, cy - size//4), (cx + size//3 - 4, cy - size//4 + 4), color, 2)


def draw_repeat_icon(frame, center, size, active=False):
    """Draw repeat icon (circular arrow)."""
    cx, cy = center
    color = (100, 200, 100) if active else (150, 150, 150)
    # Draw arc
    cv2.ellipse(frame, (cx, cy), (size//3, size//4), 0, 30, 330, color, 2)
    # Arrow at end
    cv2.line(frame, (cx + size//3 - 2, cy - 2), (cx + size//3 + 4, cy - 6), color, 2)
    cv2.line(frame, (cx + size//3 - 2, cy - 2), (cx + size//3 + 2, cy + 4), color, 2)


def draw_song_list(frame, track_names, current_idx, sidebar_width=250):
    """Draw a song list sidebar on the left of the frame."""
    h, w = frame.shape[:2]
    
    # Dark sidebar background
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (sidebar_width, h), (25, 25, 30), -1)
    cv2.addWeighted(overlay, 0.9, frame, 0.1, 0, frame)
    
    # Sidebar border
    cv2.line(frame, (sidebar_width, 0), (sidebar_width, h), (60, 60, 65), 2)
    
    # Header
    cv2.putText(frame, "PLAYLIST", (15, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (180, 180, 180), 2)
    cv2.line(frame, (15, 50), (sidebar_width - 15, 50), (60, 60, 65), 1)
    
    # Song list
    item_height = 35
    max_visible = (h - 80) // item_height
    start_y = 70
    
    # Calculate scroll offset to keep current track visible
    scroll_offset = max(0, current_idx - max_visible // 2)
    scroll_offset = min(scroll_offset, max(0, len(track_names) - max_visible))
    
    for i, name in enumerate(track_names[scroll_offset:scroll_offset + max_visible]):
        actual_idx = scroll_offset + i
        y = start_y + i * item_height
        
        # Highlight current track
        if actual_idx == current_idx:
            cv2.rectangle(frame, (5, y - 5), (sidebar_width - 10, y + item_height - 10), 
                         (50, 120, 50), -1)
            text_color = (255, 255, 255)
            # Playing indicator
            draw_play_icon(frame, (20, y + 10), 12, (255, 255, 255))
            text_x = 35
        else:
            text_color = (180, 180, 180)
            text_x = 15
        
        # Truncate long names
        display_name = name[:25] + '...' if len(name) > 25 else name
        cv2.putText(frame, display_name, (text_x, y + 18), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.45, text_color, 1, cv2.LINE_AA)
    
    # Scroll indicators
    if scroll_offset > 0:
        cv2.putText(frame, "▲", (sidebar_width // 2 - 5, 65), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)
    if scroll_offset + max_visible < len(track_names):
        cv2.putText(frame, "▼", (sidebar_width // 2 - 5, h - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)



def select_music_folder():
    """Open a folder picker dialog and return the selected path."""
    root = tk.Tk()
    root.withdraw()  # Hide the main tkinter window
    root.attributes('-topmost', True)  # Bring dialog to front
    folder_path = filedialog.askdirectory(
        title="Select Music Folder",
        initialdir=os.path.expanduser("~\\Music")
    )
    root.destroy()
    return folder_path if folder_path else None


def main(debug=False):
    print('Starting gesture-controlled local player (debug=' + str(debug) + ')')
    
    # Ask user to select a music folder at startup
    print('Please select your music folder...')
    selected_folder = select_music_folder()
    if not selected_folder:
        print('No folder selected. Exiting.')
        return
    print(f'Selected folder: {selected_folder}')
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print('Cannot open webcam')
        return

    detector = HandDetector()
    recognizer = GestureRecognizer()

    # Initialize controllers: prefer Spotify if credentials present, fallback to local
    controller = None
    using = None
    if debug:
        print('Debug mode: not initializing audio controller. Gestures will be printed but no audio will play.')
    else:
        # try Spotify if installed and credentials provided
        if spotipy is not None and os.environ.get('SPOTIPY_CLIENT_ID'):
            try:
                spc = SpotifyController()
                # If Spotify API accessible we will use it; otherwise fall back
                controller = spc
                using = 'spotify'
                print('Initialized Spotify controller (will control your active Spotify device).')
            except Exception as e:
                print('Spotify init error (will try local):', e)
                controller = None

        if controller is None:
            try:
                lc = LocalController(music_folder=selected_folder)
                controller = lc
                using = 'local'
                if lc.is_available():
                    print(f'Using local playback from: {lc.music_folder}')
                    print(f'Found {len(lc.track_paths)} track(s)')
                else:
                    print(f'No audio files found in {selected_folder}. Place .mp3/.wav/.ogg files there.')
            except Exception as e:
                print('Local controller error or pygame missing:', e)

    # State variables
    current_volume = 50
    last_action_time = 0
    action_icon = None
    is_playing = False
    shuffle_active = False
    repeat_active = False
    
    # Create resizable window
    window_name = 'PalmPlay - Gesture Music Player'
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280, 720)
    
    # Sidebar width
    SIDEBAR_WIDTH = 280

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.flip(frame, 1)
            
            # Get camera dimensions
            cam_h, cam_w = frame.shape[:2]
            
            # Process hands
            out_frame, hands = detector.find_hands(frame, draw=True)
            hand = hands[0] if hands else None

            gesture, data = recognizer.recognize(hand)

            # Get track info
            track_name = None
            track_names = []
            current_idx = 0
            if controller and hasattr(controller, 'track_paths'):
                track_names = controller.get_track_names() if hasattr(controller, 'get_track_names') else []
                current_idx = controller.idx if hasattr(controller, 'idx') else 0
                if controller.track_paths:
                    track_name = os.path.basename(controller.track_paths[current_idx])

            # Handle gestures
            if gesture == 'volume':
                vol = data
                if controller:
                    controller.set_volume(vol)
                current_volume = vol
                action_icon = 'volume'
                last_action_time = time.time()
                print(f'[GESTURE] volume -> {vol}%')
                
            elif gesture == 'fist' and recognizer.cooldown_ok('toggle'):
                if controller:
                    ok = controller.toggle_play_pause()
                    if ok:
                        is_playing = not is_playing
                        action_icon = 'pause' if is_playing else 'play'
                last_action_time = time.time()
                print('[GESTURE] fist -> toggle play/pause')
                
            elif gesture == 'swipe_right' and recognizer.cooldown_ok('next'):
                if controller:
                    ok = controller.next()
                    if ok:
                        action_icon = 'next'
                        is_playing = True
                last_action_time = time.time()
                print('[GESTURE] swipe right -> next track')
                
            elif gesture == 'swipe_left' and recognizer.cooldown_ok('prev'):
                if controller:
                    ok = controller.previous()
                    if ok:
                        action_icon = 'prev'
                        is_playing = True
                last_action_time = time.time()
                print('[GESTURE] swipe left -> previous track')
                
            elif gesture == 'open_palm' and recognizer.cooldown_ok('shuffle'):
                if controller and hasattr(controller, 'toggle_shuffle'):
                    shuffle_active = controller.toggle_shuffle()
                    action_icon = 'shuffle'
                    last_action_time = time.time()
                    print(f'[GESTURE] open palm -> shuffle {"ON" if shuffle_active else "OFF"}')
                    
            elif gesture == 'thumb_up' and recognizer.cooldown_ok('repeat'):
                if controller and hasattr(controller, 'toggle_repeat'):
                    repeat_active = controller.toggle_repeat()
                    action_icon = 'repeat'
                    last_action_time = time.time()
                    print(f'[GESTURE] thumb up -> repeat {"ON" if repeat_active else "OFF"}')

            # Create composite frame with sidebar
            composite_width = cam_w + SIDEBAR_WIDTH
            composite_frame = np.zeros((cam_h, composite_width, 3), dtype=np.uint8)
            
            # Place camera feed on the right
            composite_frame[:, SIDEBAR_WIDTH:] = out_frame
            
            # Draw song list on the left sidebar
            if track_names:
                draw_song_list(composite_frame, track_names, current_idx, SIDEBAR_WIDTH)
            else:
                # Empty sidebar
                cv2.rectangle(composite_frame, (0, 0), (SIDEBAR_WIDTH, cam_h), (25, 25, 30), -1)
                cv2.putText(composite_frame, "No tracks", (SIDEBAR_WIDTH//2 - 40, cam_h//2), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 1)
            
            # Draw shuffle/repeat indicators at bottom of sidebar
            indicator_y = cam_h - 40
            draw_shuffle_icon(composite_frame, (50, indicator_y), 30, shuffle_active)
            cv2.putText(composite_frame, "Shuffle", (70, indicator_y + 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)
            draw_repeat_icon(composite_frame, (180, indicator_y), 30, repeat_active)
            cv2.putText(composite_frame, "Repeat", (200, indicator_y + 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)
            
            # Draw modern overlay on the camera portion (right side)
            camera_portion = composite_frame[:, SIDEBAR_WIDTH:]
            draw_modern_overlay(camera_portion, track_name, current_volume, action_icon, last_action_time, is_playing)
            composite_frame[:, SIDEBAR_WIDTH:] = camera_portion

            cv2.imshow(window_name, composite_frame)
            key = cv2.waitKey(1) & 0xFF
            if key == 27 or key == ord('q'):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Gesture-controlled local music player')
    parser.add_argument('--debug', action='store_true', help='Run in debug mode (no audio playback, prints gestures)')
    args = parser.parse_args()
    main(debug=args.debug)
