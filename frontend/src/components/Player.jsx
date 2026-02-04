import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Music, Volume2, AlignLeft } from 'lucide-react';
import { getCoverUrl } from '../services/api';

const Player = ({ track, isPlaying, currentTime, volume, isShuffle, isRepeat, onTogglePlay, onNext, onPrev, onShuffle, onRepeat, onVolumeChange, onSeek, showLyrics, onToggleLyrics }) => {
    if (!track) return null;

    const duration = track.duration_sec || 1; // Avoid divide by zero
    const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    const formatTime = (seconds) => {
        if (!seconds) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 p-4 md:p-8 z-50 pointer-events-none">
            <div className="max-w-6xl mx-auto pointer-events-auto">
                <div className="liquid-glass p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 md:gap-12 relative group shadow-[0_30px_100px_rgba(0,0,0,0.8)] border-white/20 backdrop-blur-[60px]">
                    <div className="absolute inset-0 bg-crimson/[0.02] opacity-40 pointer-events-none" />
                    <div className="glass-shine" />

                    {/* Track Info */}
                    <div className="flex items-center gap-4 md:gap-6 min-w-0 flex-1 relative z-10 w-full md:w-auto">
                        <div className="w-14 h-14 md:w-20 md:h-20 flex-shrink-0 bg-white/5 rounded-2xl overflow-hidden relative border border-crimson/30 shadow-[0_0_20px_rgba(225,29,72,0.2)] group-hover:shadow-[0_0_40px_rgba(225,29,72,0.4)] transition-all duration-700">
                            <img
                                src={getCoverUrl(track.originalIdx)}
                                alt="Cover Art"
                                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-white/5 pointer-events-none">
                                <Music size={32} />
                            </div>
                            <div className="glass-shine" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                            <h2 className="text-lg md:text-2xl font-black text-white truncate tracking-tight group-hover:text-crimson transition-colors duration-500">
                                {track.name}
                            </h2>
                            <div className="flex items-center gap-3">
                                <span className="text-xs md:text-sm font-bold text-crimson uppercase tracking-[0.2em] truncate drop-shadow-[0_0_8px_rgba(225,29,72,0.4)]">
                                    {track.artist || 'Unknown Artist'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Controls & Progress */}
                    <div className="flex flex-col items-center gap-2 relative z-10 w-full md:w-auto">
                        <div className="flex items-center gap-6 md:gap-10 mb-2">
                            <button
                                onClick={onShuffle}
                                className={`transition-all duration-300 hover-micro ${isShuffle ? 'text-crimson drop-shadow-[0_0_12px_rgba(225,29,72,0.5)] scale-110' : 'text-white/30 hover:text-white/60'}`}
                            >
                                <Shuffle size={18} />
                            </button>

                            <div className="flex items-center gap-6">
                                <button
                                    onClick={onPrev}
                                    className="text-white/60 hover:text-white hover:scale-125 transition-all duration-300 hover-micro active:scale-90"
                                >
                                    <SkipBack size={24} className="fill-current" />
                                </button>

                                <button
                                    onClick={onTogglePlay}
                                    className="w-12 h-12 md:w-16 md:h-16 bg-crimson rounded-full flex items-center justify-center text-white shadow-[0_10px_40px_rgba(225,29,72,0.4)] hover:scale-110 hover:shadow-[0_15px_60px_rgba(225,29,72,0.6)] active:scale-95 transition-all duration-500 group/play hover-micro"
                                >
                                    {isPlaying ? <Pause size={28} className="fill-current" /> : <Play size={28} className="fill-current ml-1" />}
                                </button>

                                <button
                                    onClick={onNext}
                                    className="text-white/60 hover:text-white hover:scale-125 transition-all duration-300 hover-micro active:scale-90"
                                >
                                    <SkipForward size={24} className="fill-current" />
                                </button>
                            </div>

                            <button
                                onClick={onRepeat}
                                className={`transition-all duration-300 hover-micro ${isRepeat ? 'text-crimson drop-shadow-[0_0_12px_rgba(225,29,72,0.5)] scale-110' : 'text-white/30 hover:text-white/60'}`}
                            >
                                <Repeat size={18} />
                            </button>
                        </div>

                        {/* Progress Bar with Time */}
                        <div className="w-full md:w-96 flex items-center gap-3 text-xs font-mono font-medium text-white/30">
                            <span className="w-10 text-right">{formatTime(currentTime)}</span>
                            <div className="flex-1 relative group/bar flex items-center">
                                <input
                                    type="range"
                                    min="0"
                                    max={duration}
                                    value={currentTime}
                                    onChange={(e) => onSeek(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-crimson hover:bg-white/20 transition-all relative z-20 hover-micro"
                                    style={{
                                        background: `linear-gradient(to right, #e11d48 ${progress}%, rgba(255,255,255,0.1) ${progress}%)`
                                    }}
                                />
                                <div className="absolute inset-x-0 h-1.5 bg-crimson/10 blur-md opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none" />
                            </div>
                            <span className="w-10">{formatTime(track.duration_sec)}</span>
                        </div>
                    </div>

                    {/* Secondary Controls (Volume & Lyrics) */}
                    <div className="flex items-center gap-4 flex-1 justify-end relative z-10 text-white/40 group/vol">
                        <button
                            onClick={onToggleLyrics}
                            className={`p-2 rounded-lg transition-all hover-micro ${showLyrics ? 'text-crimson bg-crimson/10 shadow-[0_0_15px_rgba(225,29,72,0.2)]' : 'hover:text-white hover:bg-white/10'}`}
                            title="Toggle Lyrics"
                        >
                            <AlignLeft size={18} />
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-2" />
                        <Volume2 size={18} className="group-hover/vol:text-white transition-colors hover-micro" />
                        <div className="w-24 relative flex items-center">
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={(e) => onVolumeChange(parseInt(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-crimson hover:bg-white/20 transition-all hover-micro"
                                style={{
                                    background: `linear-gradient(to right, #e11d48 ${volume}%, rgba(255,255,255,0.1) ${volume}%)`
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Player;
