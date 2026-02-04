import { Music, Play, SkipForward } from 'lucide-react';
import { getCoverUrl } from '../services/api';

const QueuePanel = ({ tracks = [], currentTrackIdx, onPlay }) => {
    // Determine the next songs in queue
    const queue = [];
    if (tracks.length > 0) {
        // If we're at the last track, next is the first track
        for (let i = 1; i <= Math.min(5, tracks.length - 1); i++) {
            const nextIdx = (currentTrackIdx + i) % tracks.length;
            queue.push({
                ...tracks[nextIdx],
                originalIdx: nextIdx
            });
        }
    }

    return (
        <aside className="fixed top-0 right-0 bottom-32 w-80 p-3 flex flex-col gap-3 z-40 bg-black/40 backdrop-blur-xl border-l border-white/5">
            <div className="flex items-center gap-3 px-4 py-6 border-b border-white/5">
                <SkipForward size={20} className="text-crimson" />
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Up Next</h2>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-2 space-y-2">
                {queue.length > 0 ? (
                    queue.map((track, i) => (
                        <div
                            key={`${track.originalIdx}-${i}`}
                            onClick={() => onPlay(track.originalIdx)}
                            className="group relative flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-all cursor-pointer hover-micro border border-transparent hover:border-white/10"
                        >
                            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 border border-white/10 group-hover:border-crimson/30 transition-colors">
                                <img
                                    src={getCoverUrl(track.originalIdx)}
                                    alt=""
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center text-white/5 pointer-events-none">
                                    <Music size={16} />
                                </div>
                            </div>

                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-bold text-white truncate group-hover:text-crimson transition-colors">
                                    {track.name}
                                </span>
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider truncate">
                                    {track.artist}
                                </span>
                            </div>

                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play size={14} className="text-crimson fill-crimson" />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-white/20 gap-3">
                        <Music size={32} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Queue Empty</span>
                    </div>
                )}
            </div>

            {/* Quick Context for currently playing */}
            {tracks[currentTrackIdx] && (
                <div className="mt-auto p-4 rounded-2xl bg-crimson/5 border border-crimson/10">
                    <span className="text-[9px] font-black text-crimson/60 uppercase tracking-[0.2em] mb-2 block">In Rotation</span>
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-crimson animate-pulse" />
                        <span className="text-[11px] font-black text-white/80">Track {currentTrackIdx + 1} of {tracks.length}</span>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default QueuePanel;
