// PalmPlay - Frontend JavaScript

const API_BASE = '';

// State
let cameraActive = false;
let videoStream = null;
let gestureInterval = null;

// DOM Elements
const elements = {
    pickFolder: document.getElementById('pickFolder'),
    folderDisplay: document.getElementById('folderDisplay'),
    playlist: document.getElementById('playlist'),
    toggleCamera: document.getElementById('toggleCamera'),
    camera: document.getElementById('camera'),
    overlay: document.getElementById('overlay'),
    gestureIndicator: document.getElementById('gestureIndicator'),
    coverArt: document.getElementById('coverArt'),
    trackName: document.getElementById('trackName'),
    trackArtist: document.getElementById('trackArtist'),
    trackAlbum: document.getElementById('trackAlbum'),
    trackMeta: document.getElementById('trackMeta'),
    progressFill: document.getElementById('progressFill'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    prevBtn: document.getElementById('prevBtn'),
    playBtn: document.getElementById('playBtn'),
    nextBtn: document.getElementById('nextBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue'),
    sortAlpha: document.getElementById('sortAlpha'),
    sortDuration: document.getElementById('sortDuration')
};

let currentSort = 'original'; // 'original', 'alpha', 'duration'
let loadedTracks = [];
let currentTrackIdx = -1;

// API Functions
async function api(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

// Folder picker using native dialog
async function pickFolder() {
    // Prompt user for folder path (browsers can't access file system directly for security)
    const folderPath = prompt(
        'Enter the full path to your music folder:\n\n' +
        'Example: C:\\Users\\YourName\\Music\n' +
        'or: D:\\My Music'
    );

    if (!folderPath || !folderPath.trim()) {
        return;
    }

    await loadFolder(folderPath.trim());
}

// Load folder
async function loadFolder(folder) {
    if (!folder) return;

    elements.folderDisplay.textContent = 'Loading...';

    const result = await api('/api/load-folder', 'POST', { folder });
    if (result?.success) {
        elements.folderDisplay.textContent = folder.split('\\').pop() || folder.split('/').pop() || folder;
        showNotification(`Loaded ${result.count} tracks!`);
        await refreshState();
    } else {
        elements.folderDisplay.textContent = 'Failed to load folder';
        showNotification('Failed to load folder', 'error');
    }
}

// Refresh player state
async function refreshState() {
    const state = await api('/api/state');
    if (!state) return;

    loadedTracks = state.tracks;
    currentTrackIdx = state.current_idx;

    updatePlaylist();
    updatePlayer(state);
    loadCoverArt(state.current_idx);
}

// Update playlist UI
function updatePlaylist() {
    let displayTracks = [...loadedTracks].map((t, i) => ({ ...t, originalIdx: i }));

    if (currentSort === 'alpha') {
        displayTracks.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentSort === 'duration') {
        const parseDur = (d) => {
            if (!d) return 0;
            const parts = d.split(':').map(Number);
            return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
        };
        displayTracks.sort((a, b) => parseDur(a.duration) - parseDur(b.duration));
    }

    elements.playlist.innerHTML = displayTracks.map((track) => `
        <div class="track-item ${track.originalIdx === currentTrackIdx ? 'active' : ''}" data-idx="${track.originalIdx}">
            <span class="icon">${track.originalIdx === currentTrackIdx ? '▶️' : '🎵'}</span>
            <div class="track-details">
                <span class="name">${track.name}</span>
                <span class="artist">${track.artist || 'Unknown Artist'}</span>
            </div>
        </div>
    `).join('');

    // Update active sort buttons
    elements.sortAlpha.classList.toggle('active', currentSort === 'alpha');
    elements.sortDuration.classList.toggle('active', currentSort === 'duration');

    // Add click handlers
    document.querySelectorAll('.track-item').forEach(item => {
        item.addEventListener('click', () => playTrack(parseInt(item.dataset.idx)));
    });
}

// Update player UI
function updatePlayer(state) {
    const currentTrack = state.tracks[state.current_idx];

    elements.trackName.textContent = state.current_track || 'No Track Selected';
    elements.trackArtist.textContent = currentTrack ? currentTrack.artist : '';
    elements.trackAlbum.textContent = currentTrack ? currentTrack.album : '';

    elements.trackMeta.textContent = state.tracks.length > 0
        ? `Track ${state.current_idx + 1} of ${state.tracks.length}`
        : 'Select a folder to start';

    elements.playBtn.textContent = state.is_playing ? '⏸️' : '▶️';
    elements.shuffleBtn.classList.toggle('active', state.shuffle);
    elements.repeatBtn.classList.toggle('active', state.repeat);
    elements.volumeSlider.value = state.volume;
    elements.volumeValue.textContent = `${state.volume}%`;
}

// Load cover art
async function loadCoverArt(idx) {
    if (idx < 0) {
        elements.coverArt.classList.remove('loaded');
        elements.coverArt.src = '';
        return;
    }

    const coverUrl = `/api/cover/${idx}?t=${Date.now()}`;
    elements.coverArt.src = coverUrl;
    elements.coverArt.classList.add('loaded');
}

// Play specific track
async function playTrack(idx) {
    const result = await api(`/api/play/${idx}`, 'POST');
    if (result?.success) {
        await refreshState();
    }
}

// Toggle play/pause
async function togglePlay() {
    await api('/api/toggle', 'POST');
    await refreshState();
}

// Next track
async function nextTrack() {
    await api('/api/next', 'POST');
    await refreshState();
}

// Previous track
async function prevTrack() {
    await api('/api/prev', 'POST');
    await refreshState();
}

// Toggle shuffle
async function toggleShuffle() {
    await api('/api/shuffle', 'POST');
    await refreshState();
}

// Toggle repeat
async function toggleRepeat() {
    await api('/api/repeat', 'POST');
    await refreshState();
}

// Set volume
async function setVolume(vol) {
    await api(`/api/volume/${vol}`, 'POST');
    elements.volumeValue.textContent = `${vol}%`;
}

// Camera Functions
async function toggleCamera() {
    if (cameraActive) {
        stopCamera();
    } else {
        await startCamera();
    }
}

async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: 'user' }
        });
        elements.camera.srcObject = videoStream;
        cameraActive = true;
        elements.toggleCamera.textContent = 'Stop Camera';

        // Start gesture detection loop
        gestureInterval = setInterval(detectGesture, 500);

    } catch (error) {
        console.error('Camera error:', error);
        showNotification('Could not access camera', 'error');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    elements.camera.srcObject = null;
    cameraActive = false;
    elements.toggleCamera.textContent = 'Start Camera';

    if (gestureInterval) {
        clearInterval(gestureInterval);
        gestureInterval = null;
    }
}

// Capture frame and detect gesture
async function detectGesture() {
    if (!cameraActive || !videoStream) return;

    // Create canvas to capture frame
    const canvas = document.createElement('canvas');
    canvas.width = elements.camera.videoWidth;
    canvas.height = elements.camera.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(elements.camera, 0, 0);

    // Convert to blob and send to API
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');

        try {
            const response = await fetch('/api/detect-gesture', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.gesture) {
                handleGesture(result);
            }
        } catch (error) {
            console.error('Gesture detection error:', error);
        }
    }, 'image/jpeg', 0.8);
}

// Handle detected gesture
function handleGesture(result) {
    let icon = '';
    let text = '';

    switch (result.gesture) {
        case 'toggle':
            icon = '✊';
            text = 'Play/Pause';
            break;
        case 'shuffle':
            icon = '🔀';
            text = result.value ? 'Shuffle ON' : 'Shuffle OFF';
            break;
        case 'repeat':
            icon = '🔁';
            text = result.value ? 'Repeat ON' : 'Repeat OFF';
            break;
        case 'volume':
            icon = '🔊';
            text = `Volume ${result.value}%`;
            break;
    }

    if (icon) {
        showGestureIndicator(icon, text);
        refreshState();
    }
}

// Show gesture indicator
function showGestureIndicator(icon, text) {
    elements.gestureIndicator.innerHTML = `${icon} <span>${text}</span>`;
    elements.gestureIndicator.classList.remove('hidden');

    setTimeout(() => {
        elements.gestureIndicator.classList.add('hidden');
    }, 1000);
}

// Show notification
function showNotification(message, type = 'success') {
    // Simple console log for now
    console.log(`[${type}] ${message}`);
}

// Event Listeners
elements.pickFolder.addEventListener('click', pickFolder);

elements.toggleCamera.addEventListener('click', toggleCamera);
elements.playBtn.addEventListener('click', togglePlay);
elements.nextBtn.addEventListener('click', nextTrack);
elements.prevBtn.addEventListener('click', prevTrack);
elements.shuffleBtn.addEventListener('click', toggleShuffle);
elements.repeatBtn.addEventListener('click', toggleRepeat);

elements.volumeSlider.addEventListener('input', (e) => {
    setVolume(parseInt(e.target.value));
});

elements.sortAlpha.addEventListener('click', () => {
    currentSort = currentSort === 'alpha' ? 'original' : 'alpha';
    updatePlaylist();
});

elements.sortDuration.addEventListener('click', () => {
    currentSort = currentSort === 'duration' ? 'original' : 'duration';
    updatePlaylist();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    refreshState();
    console.log('PalmPlay initialized!');
});
