/**
 * API Service for PalmPlay
 * Handles communication with the Python backend
 */

// Since we setup proxy in vite.config.js, we can use relative paths
const API_BASE = '/api';

export const fetchState = async () => {
    try {
        const response = await fetch(`${API_BASE}/state`);
        if (!response.ok) throw new Error('Failed to fetch state');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const playTrack = async (idx) => {
    try {
        const response = await fetch(`${API_BASE}/play/${idx}`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const togglePlay = async () => {
    try {
        const response = await fetch(`${API_BASE}/toggle`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const nextTrack = async () => {
    try {
        const response = await fetch(`${API_BASE}/next`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const prevTrack = async () => {
    try {
        const response = await fetch(`${API_BASE}/prev`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const toggleShuffle = async () => {
    try {
        const response = await fetch(`${API_BASE}/shuffle`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const toggleRepeat = async () => {
    try {
        const response = await fetch(`${API_BASE}/repeat`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const setVolume = async (vol) => {
    try {
        const response = await fetch(`${API_BASE}/volume/${vol}`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const seekTrack = async (seconds) => {
    try {
        const response = await fetch(`${API_BASE}/seek/${seconds}`, { method: 'POST' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const deleteTrack = async (idx) => {
    try {
        const response = await fetch(`${API_BASE}/track/${idx}`, { method: 'DELETE' });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const loadFolder = async (path) => {
    try {
        const response = await fetch(`${API_BASE}/load-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: path })
        });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const addFiles = async (filePaths) => {
    try {
        const response = await fetch(`${API_BASE}/add-files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filePaths })
        });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const uploadFiles = async (files) => {
    try {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const response = await fetch(`${API_BASE}/upload-files`, {
            method: 'POST',
            body: formData
        });
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
};

export const getCoverUrl = (idx) => {
    // Direct URL to the cover endpoint
    return `${API_BASE}/cover/${idx}`;
};

export const fetchLyrics = async (artist, title, duration) => {
    const cleanQuery = (str) => {
        if (!str) return '';
        let cleaned = str;

        // Remove text in parentheses or brackets
        cleaned = cleaned.replace(/\([^)]*\)|\[[^\]]*\]/g, '');

        // Split by common separators and take the first part
        const separators = [' - ', ' | ', ' : ', ' – ', ' — '];
        for (const sep of separators) {
            if (cleaned.includes(sep)) {
                cleaned = cleaned.split(sep)[0];
                break;
            }
        }

        // Remove common "noise" words
        const noise = [/official/gi, /video/gi, /audio/gi, /lyrics/gi, /full song/gi, /hd/gi, /4k/gi];
        noise.forEach(n => cleaned = cleaned.replace(n, ''));

        return cleaned.trim();
    };

    const ultraClean = (str) => {
        return str.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    };

    try {
        const cleanTitle = cleanQuery(title);
        const cleanArtist = cleanQuery(artist);

        console.log(`[Lyrics] Original: "${title}" by "${artist}"`);
        console.log(`[Lyrics] Cleaned: "${cleanTitle}" by "${cleanArtist}"`);

        // 1. Try exact match first
        const exactQuery = new URLSearchParams({
            artist_name: cleanArtist,
            track_name: cleanTitle,
            duration: duration || 0
        }).toString();

        const response = await fetch(`https://lrclib.net/api/get?${exactQuery}`);
        if (response.ok) {
            const data = await response.json();
            console.log(`[Lyrics] Exact match found!`);
            return data;
        }

        // 2. Fallback to search
        console.log(`[Lyrics] No exact match. Searching...`);

        // If artist is unknown, just search for the title
        const isUnknownArtist = !cleanArtist || cleanArtist.toLowerCase().includes('unknown');
        const searchTerms = isUnknownArtist ? cleanTitle : `${cleanArtist} ${cleanTitle}`;

        const searchQuery = new URLSearchParams({ q: searchTerms }).toString();

        let searchResponse = await fetch(`https://lrclib.net/api/search?${searchQuery}`);
        let results = searchResponse.ok ? await searchResponse.json() : [];

        // 3. Last ditch effort: if still no results and we had an artist, try searching with just title
        if (results.length === 0 && !isUnknownArtist) {
            console.log(`[Lyrics] Full search failed. Retrying with title only: "${cleanTitle}"`);
            const fallbackQuery = new URLSearchParams({ q: cleanTitle }).toString();
            searchResponse = await fetch(`https://lrclib.net/api/search?${fallbackQuery}`);
            if (searchResponse.ok) results = await searchResponse.json();
        }

        if (results && results.length > 0) {
            console.log(`[Lyrics] Search returned ${results.length} results`);
            const best = results.find(r => r.syncedLyrics) || results[0];
            console.log(`[Lyrics] Selected best match: "${best.trackName}" by "${best.artistName}"`);
            return best;
        }

        // 4. Final desperate attempt: Ultra clean title search
        console.log(`[Lyrics] Still nothing. Trying ultra-clean title...`);
        const ultraQuery = new URLSearchParams({ q: ultraClean(cleanTitle) }).toString();
        searchResponse = await fetch(`https://lrclib.net/api/search?${ultraQuery}`);
        if (searchResponse.ok) {
            results = await searchResponse.json();
            if (results && results.length > 0) {
                console.log(`[Lyrics] Ultra-clean search success!`);
                return results.find(r => r.syncedLyrics) || results[0];
            }
        }

        console.warn(`[Lyrics] No results found.`);
        return null;
    } catch (error) {
        console.error('[Lyrics] API Error:', error);
        return null;
    }
};
