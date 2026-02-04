import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    SortAsc,
    Play,
    Music,
    Clock,
    ChevronDown,
    Calendar,
    Trash2
} from 'lucide-react';
import { getCoverUrl } from '../services/api';

const Playlist = memo(({ tracks = [], currentTrackIdx, isPlaying, onPlay, onDelete, externalSearchTerm }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('title');
    const listRef = useRef(null);

    useEffect(() => {
        if (externalSearchTerm !== undefined) {
            setSearchTerm(externalSearchTerm);
        }
    }, [externalSearchTerm]);

    // Auto-scroll to active track
    useEffect(() => {
        if (currentTrackIdx !== -1 && listRef.current) {
            const activeElement = listRef.current.querySelector('[data-active="true"]');
            if (activeElement) {
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentTrackIdx]);

    const filteredTracks = useMemo(() => {
        return tracks.map((t, i) => ({ ...t, originalIdx: i })).filter(t =>
            (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.artist || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.album || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [tracks, searchTerm]);

    const sortedTracks = useMemo(() => {
        return [...filteredTracks].sort((a, b) => {
            if (sortOption === 'title') {
                return (a.name || '').localeCompare(b.name || '');
            } else if (sortOption === 'duration') {
                const parseDuration = (d) => {
                    if (!d) return 0;
                    const parts = d.split(':').map(Number);
                    if (parts.length === 2) return (parts[0] * 60) + parts[1];
                    return parts[0] || 0;
                };
                return parseDuration(a.duration) - parseDuration(b.duration);
            }
            return 0;
        });
    }, [filteredTracks, sortOption]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } }
    };

    return (
        <div className="w-full max-w-6xl mx-auto p-4 md:p-8 pb-32">
            <motion.header
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="mb-8 flex flex-wrap items-stretch gap-6 relative z-10"
            >
                {/* Title Box */}
                <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] flex-1 min-w-[300px] flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-crimson/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="relative z-10">
                        <h1 className="text-5xl font-black text-white tracking-tighter leading-none">
                            My <span className="text-crimson">Playlist</span>
                        </h1>
                        <div className="flex items-center gap-2 mt-3">
                            <div className="h-1 w-12 bg-crimson rounded-full" />
                            <div className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">
                                {tracks.length} Selection
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sort & Search Controls Group */}
                <div className="flex flex-wrap gap-6 items-stretch">
                    {/* Sort Box */}
                    <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] flex flex-col justify-center gap-4 min-w-[240px]">
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] relative z-10 flex items-center gap-2">
                            <SortAsc size={12} className="text-crimson" /> Sort Collection
                        </div>
                        <div className="flex bg-white/5 rounded-2xl p-1.5 border border-white/10 backdrop-blur-xl relative z-10">
                            <button
                                onClick={() => setSortOption('title')}
                                className={`flex-1 px-6 py-2.5 rounded-xl text-xs font-black transition-all duration-300 hover-micro ${sortOption === 'title' ? 'bg-crimson text-white shadow-[0_8px_20px_rgba(225,29,72,0.3)]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                            >
                                A-Z
                            </button>
                            <button
                                onClick={() => setSortOption('duration')}
                                className={`flex-1 px-6 py-2.5 rounded-xl text-xs font-black transition-all duration-300 hover-micro ${sortOption === 'duration' ? 'bg-crimson text-white shadow-[0_8px_20px_rgba(225,29,72,0.3)]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                            >
                                DURATION
                            </button>
                        </div>
                    </div>

                    {/* Search Box */}
                    <div className="bg-white/5 border border-white/10 p-8 rounded-[32px] flex flex-col justify-center gap-4 min-w-[280px]">
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] relative z-10 flex items-center gap-2">
                            <Search size={12} className="text-crimson" /> Quick Find
                        </div>
                        <div className="relative z-10">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                            <input
                                type="text"
                                placeholder="Search library..."
                                className="bg-white/10 border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-crimson/30 w-full transition-all duration-300 text-white placeholder-gray-600 focus:bg-white/20 hover-micro"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* Table Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_2fr_1.5fr_1fr_auto_auto] gap-4 px-8 py-3 mb-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] relative z-10">
                <div className="w-8 text-center">#</div>
                <div className="liquid-glass px-4 py-2 rounded-xl flex items-center gap-2 text-white">
                    <div className="glass-shine" />
                    <span className="relative z-10">Title</span>
                </div>
                <div className="hidden md:flex liquid-glass px-4 py-2 rounded-xl items-center gap-2 text-white">
                    <div className="glass-shine" />
                    <span className="relative z-10">Album</span>
                </div>
                <div className="hidden md:flex liquid-glass px-4 py-2 rounded-xl items-center gap-2 text-white">
                    <div className="glass-shine" />
                    <span className="relative z-10">Year</span>
                </div>
                <div className="flex justify-end"><Clock size={16} /></div>
                <div className="w-8"></div>
            </div>

            {/* Track List with Framer Motion */}
            <motion.div
                ref={listRef}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-3 relative z-10"
            >
                <AnimatePresence mode="popLayout">
                    {sortedTracks.map((track, idx) => {
                        const isCurrent = track.originalIdx === currentTrackIdx;

                        return (
                            <motion.div
                                key={track.originalIdx}
                                variants={itemVariants}
                                layout
                                initial="hidden"
                                animate="visible"
                                exit={{ opacity: 0, x: -20 }}
                                className="group flex items-center gap-4 md:gap-6 px-4 md:px-8 mb-3"
                                data-active={isCurrent}
                            >
                                {/* Index / Play Icon */}
                                <div
                                    onClick={() => onPlay(track.originalIdx)}
                                    className="w-8 flex-shrink-0 flex justify-center items-center text-sm font-medium cursor-pointer"
                                >
                                    {isCurrent ? (
                                        <div className="relative w-4 h-4">
                                            <div className="absolute inset-0 bg-crimson rounded-full animate-ping opacity-75"></div>
                                            <Play size={16} className="relative z-10 fill-crimson text-crimson" />
                                        </div>
                                    ) : (
                                        <>
                                            <span className="group-hover:hidden text-gray-500 font-mono tracking-tighter">{idx + 1}</span>
                                            <Play size={16} className="hidden group-hover:block text-white translate-x-1" />
                                        </>
                                    )}
                                </div>

                                {/* Track Content Box */}
                                <div
                                    onClick={() => onPlay(track.originalIdx)}
                                    className={`
                                flex-1 grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1.5fr_1fr_auto] gap-4 md:gap-8 p-4 md:p-6 rounded-[24px] md:rounded-[32px] items-center transition-all duration-500 relative overflow-hidden cursor-pointer hover-micro
                                border
                                ${isCurrent ? 'active-track-pulsing' : 'border-transparent bg-transparent'}
                                group-hover:liquid-glass group-hover:border-white/20 group-hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]
                            `}>
                                    <div className="hidden group-hover:block glass-shine" />

                                    {/* Title & Artist */}
                                    <div className="flex items-center gap-4 md:gap-6 min-w-0 relative z-10">
                                        <div className={`w-12 h-12 md:w-16 md:h-16 flex-shrink-0 bg-white/5 rounded-xl md:rounded-2xl overflow-hidden relative border transition-colors ${isCurrent ? 'border-crimson/40 shadow-[0_0_15px_rgba(225,29,72,0.3)]' : 'border-white/5'} group-hover:border-crimson/40`}>
                                            <img
                                                src={getCoverUrl(track.originalIdx)}
                                                alt="Art"
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }}
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center text-white/5 pointer-events-none">
                                                <Music size={24} />
                                            </div>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="truncate font-black text-lg md:text-xl tracking-tight text-white group-hover:text-crimson transition-colors duration-300">
                                                {track.name}
                                            </span>
                                            <span className={`truncate text-xs md:text-sm font-bold uppercase tracking-widest ${isCurrent ? 'text-crimson' : 'text-gray-500'} group-hover:text-crimson/70 transition-colors`}>
                                                {track.artist}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="hidden md:block truncate text-sm font-medium text-white/70 relative z-10">
                                        {track.album}
                                    </div>

                                    <div className="hidden md:block text-sm font-bold text-white/40 tracking-widest relative z-10">
                                        {track.year}
                                    </div>

                                    <div className="text-sm font-black font-mono text-gray-500 group-hover:text-white relative z-10 pr-2 transition-colors">
                                        {track.duration}
                                    </div>
                                </div>

                                {/* Delete Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(track.originalIdx);
                                    }}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all hover-micro ${isCurrent ? 'text-crimson/80' : 'text-gray-500'} hover:text-crimson hover:bg-crimson/10 md:opacity-0 group-hover:opacity-100`}
                                    title="Delete Track"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            {sortedTracks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Music size={48} className="mb-4 opacity-20" />
                    <p>No tracks found in your library</p>
                </div>
            )}
        </div>
    );
});

export default Playlist;
