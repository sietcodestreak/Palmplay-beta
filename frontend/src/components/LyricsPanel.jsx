import { useRef, useEffect, useState } from 'react';
import { X, Music, Loader2 } from 'lucide-react';
import { fetchLyrics } from '../services/api';

const LyricsPanel = ({ isOpen, onClose, track, currentTime }) => {
    const scrollRef = useRef(null);
    const [lyrics, setLyrics] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [refresh, setRefresh] = useState(0);

    const parseLRC = (lrcString) => {
        if (!lrcString) return [];
        const lines = lrcString.split('\n');
        const result = [];
        const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/;

        lines.forEach(line => {
            const match = timeRegex.exec(line);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseFloat(match[2]);
                const time = minutes * 60 + seconds;
                const text = line.replace(timeRegex, '').trim();
                if (text) {
                    result.push({ time, text });
                }
            } else if (!line.startsWith('[') && line.trim()) {
                result.push({ time: -1, text: line.trim() });
            }
        });
        return result.sort((a, b) => (a.time === -1 ? 0 : a.time) - (b.time === -1 ? 0 : b.time));
    };

    useEffect(() => {
        const getLyrics = async () => {
            if (!track || !isOpen) return;

            setIsLoading(true);
            setError(null);
            setLyrics([]);

            try {
                const data = await fetchLyrics(track.artist, track.name, track.duration_sec);
                if (data) {
                    if (data.syncedLyrics) {
                        setLyrics(parseLRC(data.syncedLyrics));
                    } else if (data.plainLyrics) {
                        setLyrics(data.plainLyrics.split('\n').map(text => ({ time: -1, text: text.trim() })));
                    } else {
                        setError("No lyrics found for this track.");
                    }
                } else {
                    setError("Lyrics not available.");
                }
            } catch (err) {
                setError("Failed to fetch lyrics.");
            } finally {
                setIsLoading(false);
            }
        };

        getLyrics();
    }, [track?.name, track?.artist, isOpen, refresh]);

    // Use a more compatible way to find the last active index
    const currentLineIdx = (() => {
        for (let i = lyrics.length - 1; i >= 0; i--) {
            if (lyrics[i].time !== -1 && currentTime >= lyrics[i].time) {
                return i;
            }
        }
        return -1;
    })();

    useEffect(() => {
        if (scrollRef.current && currentLineIdx !== -1) {
            const activeLine = scrollRef.current.children[currentLineIdx];
            if (activeLine) {
                activeLine.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }, [currentLineIdx]);

    if (!isOpen) return null;

    return (
        <aside
            className="fixed top-0 right-0 bottom-0 w-80 bg-[#0a0a0a] border-l border-crimson/50 z-[100] flex flex-col shadow-[-20px_0_100px_rgba(0,0,0,0.9)] no-pause"
        >
            {/* Header */}
            <div className="p-6 flex items-center justify-between border-b border-crimson/20">
                <div className="flex flex-col min-w-0">
                    <h3 className="text-[10px] font-black text-crimson/80 uppercase tracking-[0.3em] mb-1">Live Lyrics</h3>
                    <h2 className="text-sm font-bold text-white truncate">{track?.name || 'No Track'}</h2>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{track?.artist || 'Unknown Artist'}</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Lyrics Scroll Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 no-scrollbar scroll-smooth"
            >
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-white/20 gap-4">
                        <Loader2 size={32} className="animate-spin text-crimson" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Searching Lyrics...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-6 px-4">
                        <div className="p-4 rounded-full bg-white/[0.03] border border-white/5">
                            <Music size={40} className="opacity-20" />
                        </div>
                        <div className="flex flex-col gap-2 items-center text-center">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{error}</p>
                            <button
                                onClick={() => setRefresh(prev => prev + 1)}
                                className="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white/60 transition-all hover-micro"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                ) : (
                    lyrics.map((line, idx) => (
                        <div
                            key={idx}
                            className={`text-xl font-bold transition-all duration-300 cursor-default flex flex-col gap-1 ${idx === currentLineIdx
                                ? 'text-white scale-105 opacity-100'
                                : 'text-white/20'
                                }`}
                        >
                            {line.text}
                            {idx === currentLineIdx && line.time !== -1 && (
                                <div className="h-[2px] bg-crimson rounded-full w-full shadow-[0_0_10px_rgba(225,29,72,0.5)]" />
                            )}
                        </div>
                    ))
                )}

                {!isLoading && !error && lyrics.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4 opacity-20">
                        <Music size={48} />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Instrumental Section</p>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default LyricsPanel;
