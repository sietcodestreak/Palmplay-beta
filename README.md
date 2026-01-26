# 🖐️ PalmPlay: Magic Music Hands

Control your music with the wave of a hand! **PalmPlay** uses computer vision and hand tracking to turn your webcam into a touch-free media controller for Spotify and local music files.

---

## 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Spotify (Optional)**:
   For Spotify control, set your credentials as environment variables:
   - `SPOTIPY_CLIENT_ID`
   - `SPOTIPY_CLIENT_SECRET`
   - `SPOTIPY_REDIRECT_URI`

3. **Run Application**:
   ```bash
   python gesture_spotify_player.py
   ```

---

## 👋 Magic Gestures

The player uses intuitive gestures to control your playback:

- ✊ **Fist**: ⏯️ Toggle Play / Pause
- 🖐️ **Swipe Right**: ⏭️ Next Track (+ Cycle Instrument Panel)
- 🖐️ **Swipe Left**: ⏮️ Previous Track (+ Cycle Instrument Panel)
- ✌️ **Two Fingers (V-Sign)**: 🔊 Control Volume by moving hand **Up or Down**

---

## 🛠️ Requirements

- **Python 3.8+**
- **Webcam**
- **Core Libraries**:
  - `opencv-python`: For video processing
  - `mediapipe`: For hand tracking
  - `spotipy`: For Spotify integration
  - `pygame`: For local file playback
  - `pycaw`: For system volume control (Windows)

Install everything at once:
```bash
pip install -r requirements.txt
```

---

## 📜 Project Structure

- `gesture_spotify_player.py`: Main application script.
- `local_music/`: Folder for your `.mp3`, `.wav`, or `.ogg` files.
- `requirements.txt`: List of necessary Python packages.
- `check_env.py`: Helper script to verify your setup.

---
*Created with ❤️ for intuitive music control.*
