import { Play } from 'lucide-react';

const Home = ({ onNavigate }) => {
    const featured = [
        { title: 'PalmPlay Playlist', color: 'bg-crimson', icon: '🎵', isPrimary: true },
    ];

    const personalized = [
        { title: 'Daily Mix 1', description: 'A.R. Rahman, Harris Jayaraj, Anirudh...', img: 'https://seed-mix-image.spotifycdn.com/v6/img/artist/1mYsTxnqsMTpAIvLvzwuU4/en/default' },
        { title: 'Discover Weekly', description: 'Your shortcut to hidden gems, deep...', img: 'https://newjams-images.scdn.co/image/ab67647700007150/dt/v3/discover-weekly/abc' },
        { title: 'Daily Mix 2', description: 'Vishal Chandrashekhar...', img: 'https://seed-mix-image.spotifycdn.com/v6/img/artist/4YRxDV8wJF6BTv7InMM19v/en/default' },
    ];

    return (
        <div className="flex-1 p-8 pt-6 overflow-y-auto no-scrollbar pb-40">


            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {featured.map((item, i) => (
                    <div
                        key={i}
                        onClick={() => onNavigate('playlist')}
                        className="group flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-md overflow-hidden transition-all cursor-pointer relative hover-micro"
                    >
                        <div className={`w-16 h-16 md:w-20 md:h-20 ${item.color} flex items-center justify-center text-2xl shadow-xl`}>
                            {item.img ? <img src={item.img} className="w-full h-full object-cover" /> : item.icon}
                        </div>
                        <span className="font-bold truncate pr-12">{item.title}</span>
                        <div className="absolute right-4 w-12 h-12 bg-crimson rounded-full flex items-center justify-center shadow-2xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                            <Play size={20} className="fill-white" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Personalized Section - Simplified to PalmPlay Radio */}
            <div className="mb-10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black tracking-tight">Your Soundtrack</h2>
                </div>

                <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
                    {/* PalmPlay Shortcut */}
                    <div
                        onClick={() => onNavigate('playlist')}
                        className="bg-crimson/5 hover:bg-crimson/10 p-4 rounded-xl transition-all duration-300 w-48 flex-shrink-0 cursor-pointer group border border-crimson/20 hover-micro"
                    >
                        <div className="w-40 h-40 bg-crimson/20 rounded-lg mb-4 shadow-2xl flex items-center justify-center relative backdrop-blur-sm">
                            <Play size={48} className="text-crimson/40" />
                            <div className="absolute bottom-2 right-2 w-12 h-12 bg-crimson rounded-full flex items-center justify-center shadow-2xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                                <Play size={20} className="fill-white" />
                            </div>
                        </div>
                        <h3 className="font-bold mb-1 text-crimson">PalmPlay Playlist</h3>
                        <p className="text-xs text-crimson/60 font-medium line-clamp-2 leading-relaxed">
                            Your local collection with gesture-magic controls.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;
