import { Library, Plus, ArrowRight, Search, Heart, Music, Mic2, Disc, Play } from 'lucide-react';
import React, { useState } from 'react';

const Sidebar = ({ currentView, onViewChange, onRefresh, tracks = [], currentTrack, currentTrackIdx, isPlaying, searchTerm, onSearchChange, onPlay }) => {
    // Helper to format total duration
    const totalDurationSec = tracks.reduce((acc, t) => acc + (t.duration_sec || 0), 0);
    const formatTotalDuration = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const fileInputRef = React.useRef(null);

    const handleLoadFolder = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (event) => {
        const files = Array.from(event.target.files).filter(file =>
            file.name.toLowerCase().endsWith('.mp3') ||
            file.type === 'audio/mpeg' ||
            file.type === 'audio/mp3'
        );

        if (!files || files.length === 0) return;

        try {
            const { uploadFiles } = await import('../services/api');
            const result = await uploadFiles(files);
            if (result?.success) {
                if (onRefresh) await onRefresh();
                onViewChange('playlist');
            }
        } catch (error) {
            console.error('Upload error:', error);
        }
        event.target.value = '';
    };

    // Calculate queue
    const queue = [];
    if (tracks.length > 0 && currentTrackIdx !== -1) {
        for (let i = 1; i <= Math.min(3, tracks.length - 1); i++) {
            const idx = (currentTrackIdx + i) % tracks.length;
            queue.push({ ...tracks[idx], originalIdx: idx });
        }
    }

    return (
        <aside className="fixed top-0 left-0 bottom-32 w-80 p-3 flex flex-col gap-3 z-40">
            {/* Top Navigation */}
            <div className="bg-white/5 backdrop-blur-3xl rounded-xl p-4 flex flex-col gap-4 border border-white/5">
                <button
                    onClick={() => onViewChange('home')}
                    className={`flex items-center gap-4 px-3 py-2 rounded-lg transition-all hover-micro ${currentView === 'home' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    <Play size={20} className={currentView === 'home' ? 'text-crimson' : ''} />
                    <span className="font-bold">Home</span>
                </button>
                <div className="flex items-center gap-4 px-3 py-2 rounded-lg text-gray-400 transition-all hover:text-white group focus-within:text-white hover-micro">
                    <Search size={20} />
                    <input
                        type="text"
                        placeholder="Search Library"
                        className="bg-transparent border-none outline-none font-bold text-gray-400 placeholder:text-gray-400 group-focus-within:text-white focus:placeholder:text-white/50 w-full"
                        value={searchTerm}
                        onChange={(e) => {
                            if (onSearchChange) onSearchChange(e.target.value);
                            if (currentView !== 'playlist') onViewChange('playlist');
                        }}
                    />
                </div>
            </div>

            {/* Your Library Section */}
            <div className="flex-1 bg-white/5 backdrop-blur-3xl rounded-xl flex flex-col overflow-hidden border border-white/5">
                <div className="p-4 flex items-center justify-between text-gray-400">
                    <div className="flex items-center gap-2 hover:text-white cursor-pointer transition-colors group/lib hover-micro">
                        <Library size={24} className="group-hover/lib:text-crimson transition-colors" />
                        <span className="font-bold">Your Library</span>
                    </div>
                    <button
                        onClick={handleLoadFolder}
                        className="p-2 hover:bg-white/10 rounded-full transition-all group/plus hover-micro"
                        title="Add Music Folder"
                    >
                        <Plus size={20} className="group-hover/plus:text-crimson group-hover/plus:scale-125 transition-all" />
                    </button>
                </div>

                {/* Library List */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin scrollbar-thumb-white/10">
                    <div className="flex flex-col">
                        {/* Playlist Link */}
                        <div
                            onClick={() => onViewChange('playlist')}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer group transition-all hover-micro relative overflow-hidden ${currentView === 'playlist' ? 'bg-white/[0.08] shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] border-t border-white/[0.03]' : 'hover:bg-white/5'}`}
                        >
                            {/* Vertical Accent Rail */}
                            {currentView === 'playlist' && (
                                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full transition-colors ${isPlaying ? 'bg-crimson/60' : 'bg-crimson/30'}`} />
                            )}

                            <div className="w-12 h-12 rounded-md bg-crimson flex items-center justify-center text-white shadow-[0_5px_15px_rgba(225,29,72,0.3)] shrink-0">
                                <Music size={20} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className={`font-bold truncate ${currentView === 'playlist' ? 'text-crimson' : 'text-white'}`}>PalmPlay Playlist</span>
                                <span className="text-xs text-gray-400 font-medium">Your Local Collection</span>
                            </div>
                        </div>

                        {/* Minimal Contextual Info Panel */}
                        <div className="mt-6 mx-2 px-3 py-5 border-t border-white/5 flex flex-col gap-4">
                            {currentTrack && (
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Now Playing</span>
                                    <span className="text-xs font-bold text-white/50 truncate leading-tight">{currentTrack.name}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Library</span>
                                    <span className="text-xs font-bold text-white/30">{tracks.length} Songs</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Duration</span>
                                    <span className="text-xs font-bold text-white/30">{formatTotalDuration(totalDurationSec)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Gesture Guide (Instruction of the Song) */}
                        <div className="mx-2 px-3 py-5 border-t border-white/5">
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 block">Gesture Guide</span>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-2 text-[10px] text-white/40 bg-white/5 p-2 rounded-lg border border-white/5">
                                    <span className="text-sm">✊</span> <span>Play/Pause</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-white/40 bg-white/5 p-2 rounded-lg border border-white/5">
                                    <span className="text-sm">👉</span> <span>Next</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-white/40 bg-white/5 p-2 rounded-lg border border-white/5">
                                    <span className="text-sm">👈</span> <span>Prev</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-white/40 bg-white/5 p-2 rounded-lg border border-white/5">
                                    <span className="text-sm">✌️</span> <span>Volume</span>
                                </div>
                            </div>
                        </div>

                        {/* Up Next Section */}
                        {queue.length > 0 && (
                            <div className="mx-2 px-3 py-5 border-t border-white/5">
                                <span className="text-[9px] font-black text-crimson uppercase tracking-[0.2em] mb-3 block">Up Next</span>
                                <div className="flex flex-col gap-2">
                                    {queue.map((track, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer group transition-all border border-transparent hover:border-white/5"
                                            onClick={() => onPlay(track.originalIdx)}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-white/5 shrink-0 overflow-hidden border border-white/5 group-hover:border-crimson/30">
                                                <img
                                                    src={`/api/cover/${track.originalIdx}`}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-white truncate group-hover:text-crimson transition-colors">{track.name}</span>
                                                <span className="text-[10px] text-white/30 truncate uppercase tracking-tighter">{track.artist}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                webkitdirectory="true"
                directory="true"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />
        </aside>
    );
};

export default Sidebar;
