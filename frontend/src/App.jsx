import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import Playlist from './components/Playlist';
import Player from './components/Player';
import LyricsPanel from './components/LyricsPanel';
import QueuePanel from './components/QueuePanel';
import GestureController from './components/GestureController';
import {
  fetchState,
  playTrack,
  togglePlay,
  nextTrack,
  prevTrack,
  toggleShuffle,
  toggleRepeat,
  loadFolder,
  deleteTrack,
  setVolume,
  seekTrack,
} from './services/api';
import './App.css';

function App() {
  const [view, setView] = useState('playlist'); // 'home' or 'playlist'
  const [searchTerm, setSearchTerm] = useState(''); // Global search state
  const [showLyrics, setShowLyrics] = useState(false); // Lyrics visibility
  const [precisePosition, setPrecisePosition] = useState(0); // Interpolated position
  const [state, setState] = useState({
    tracks: [],
    current_idx: -1,
    is_playing: false,
    shuffle: false,
    repeat: false
  });

  const updateState = async () => {
    try {
      const newState = await fetchState();
      if (newState && Array.isArray(newState.tracks)) {
        setState(prev => {
          // Optimization: Only update if state actually changed
          const tracksChanged = prev.tracks.length !== newState.tracks.length;
          const playStateChanged = prev.is_playing !== newState.is_playing;
          const idxChanged = prev.current_idx !== newState.current_idx;
          const posChanged = Math.abs((prev.position || 0) - (newState.position || 0)) > 1.5;
          const volChanged = prev.volume !== newState.volume;
          const controlsChanged = prev.shuffle !== newState.shuffle || prev.repeat !== newState.repeat;

          if (!tracksChanged && !playStateChanged && !idxChanged && !posChanged && !volChanged && !controlsChanged) {
            return prev;
          }
          return newState;
        });
      }
    } catch (error) {
      console.error("Failed to fetch state:", error);
    }
  };

  const handleViewChange = async (newView, folderPath = null) => {
    setView(newView);
    if (folderPath) {
      try {
        const result = await loadFolder(folderPath);
        if (result?.success) {
          console.log(`Loaded ${result.count} tracks from ${folderPath}`);
          await updateState();
        } else {
          alert(`Error: ${result?.error || 'Failed to load folder'}`);
        }
      } catch (error) {
        console.error("Folder load error:", error);
      }
    }
  };

  useEffect(() => {
    updateState();
    const interval = setInterval(updateState, 2000);
    return () => clearInterval(interval);
  }, []);

  // Smoothly interpolate position for lyrics sync
  useEffect(() => {
    if (state.position !== undefined) {
      const diff = Math.abs(precisePosition - state.position);
      // Only snap if drift is more than 0.5 seconds or if not playing
      if (diff > 0.5 || !state.is_playing) {
        setPrecisePosition(state.position);
      }
    }
  }, [state.position, state.is_playing]);

  useEffect(() => {
    if (state.is_playing) {
      const interval = setInterval(() => {
        setPrecisePosition(prev => prev + 0.05);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [state.is_playing]);

  const handlePlay = async (idx) => {
    const result = await playTrack(idx);
    if (result?.state) setState(result.state);
  };

  const handleTogglePlay = async () => {
    const result = await togglePlay();
    if (result) {
      setState(prev => ({ ...prev, is_playing: result.is_playing }));
    }
  };

  const handleNext = async () => {
    const result = await nextTrack();
    if (result?.state) {
      setState(result.state);
      setPrecisePosition(result.state.position || 0);
    }
  };

  const handlePrev = async () => {
    const result = await prevTrack();
    if (result?.state) {
      setState(result.state);
      setPrecisePosition(result.state.position || 0);
    }
  };

  const handleShuffle = async () => {
    await toggleShuffle();
    updateState();
  };

  const handleRepeat = async () => {
    await toggleRepeat();
    updateState();
  };

  const handleDelete = async (idx) => {
    if (confirm('Are you sure you want to delete this track?')) {
      const result = await deleteTrack(idx);
      if (result?.state) {
        setState(result.state);
      } else {
        updateState();
      }
    }
  };

  const currentTrack = state.tracks[state.current_idx] ? {
    ...state.tracks[state.current_idx],
    originalIdx: state.current_idx
  } : null;

  // Debugging logs for clicks
  const handlePlayWithLog = (idx) => {
    console.log(`[App] Clicking to play track ${idx}`);
    handlePlay(idx);
  };

  const handleTogglePlayWithLog = () => {
    console.log(`[App] Toggling play/pause. Current state is_playing: ${state.is_playing}`);
    handleTogglePlay();
  };

  return (
    <div className={`min-h-screen bg-black text-white font-sans selection:bg-crimson/30 selection:text-white relative overflow-hidden flex`}>
      <div className="ambient-glow" />
      {/* Background Meshes and Liquid Sources */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-crimson/15 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-crimson/20 rounded-full blur-[140px]" />

        {/* Subtle grid to show glass refraction better */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(#e11d48 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Persistent Sidebar */}
      <Sidebar
        currentView={view}
        onViewChange={handleViewChange}
        onRefresh={updateState}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        tracks={state.tracks}
        currentTrack={currentTrack}
        currentTrackIdx={state.current_idx}
        isPlaying={state.is_playing}
        onPlay={handlePlayWithLog}
      />

      {/* Main Content Area */}
      <main className="flex-1 ml-80 h-screen flex flex-col relative overflow-hidden">
        {view === 'home' && (
          <div className="flex-1 overflow-y-auto no-scrollbar pb-40">
            <Home onNavigate={handleViewChange} />
          </div>
        )}

        {view === 'playlist' && (
          <div className="flex-1 overflow-y-auto no-scrollbar pb-40">
            <Playlist
              tracks={state.tracks}
              currentTrackIdx={state.current_idx}
              isPlaying={state.is_playing}
              onPlay={handlePlayWithLog}
              onDelete={handleDelete}
              externalSearchTerm={searchTerm}
            />
          </div>
        )}
      </main>



      {/* Persistent Player */}
      {currentTrack && (
        <Player
          track={currentTrack}
          isPlaying={state.is_playing}
          currentTime={precisePosition}
          volume={state.volume}
          isShuffle={state.shuffle}
          isRepeat={state.repeat}
          onTogglePlay={handleTogglePlayWithLog}
          onNext={handleNext}
          onPrev={handlePrev}
          onShuffle={handleShuffle}
          onRepeat={handleRepeat}
          onVolumeChange={async (vol) => {
            setState(prev => ({ ...prev, volume: vol }));
            await setVolume(vol);
          }}
          onSeek={async (seconds) => {
            setPrecisePosition(seconds);
            setState(prev => ({ ...prev, position: seconds }));
            const result = await seekTrack(seconds);
            if (result?.state) setState(result.state);
          }}
          showLyrics={showLyrics}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
        />
      )}

      <GestureController
        onGestureDetected={() => {
          updateState();
        }}
      />

      {showLyrics && (
        <LyricsPanel
          isOpen={showLyrics}
          onClose={() => setShowLyrics(false)}
          track={currentTrack}
          currentTime={precisePosition}
        />
      )}
    </div>
  );
}

export default App;
