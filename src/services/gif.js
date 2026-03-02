const { searchWebImages } = require("./search");

/**
 * ULTRA-PERFECT REAL-WORLD GIF ENGINE
 * Scrapes the real web for situationally relevant GIFs.
 */
async function getGif(query) {
    const rawQuery = query || "happy";
    const searchQuery = `${rawQuery} reaction gif`;

    console.log(`🎬 [GIF ENGINE] Hunting for real-world GIF: ${searchQuery}`);

    try {
        const gifResults = await searchWebImages(searchQuery, 10);
        if (!gifResults || gifResults.length === 0) throw new Error("No GIFs found");

        const blockedDomains = ["wikimedia.org", "wikipedia.org", "giphy.com/gifs/", "lookaside.fbsbx.com"];
        const validUrls = gifResults.filter(url => {
            const lower = url.toLowerCase();
            return lower.endsWith('.gif') && !blockedDomains.some(d => lower.includes(d));
        });

        const urlsToTry = [...validUrls, ...gifResults].slice(0, 5);

        for (const url of urlsToTry) {
            try {
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36' },
                    timeout: 5000
                });
                if (res.ok) {
                    console.log(`✅ [GIF ENGINE] Validated URL: ${url}`);
                    return url;
                }
            } catch (e) {
                console.warn(`⚠️ [GIF ENGINE] Failed to fetch ${url}, trying next...`);
            }
        }
    } catch (err) {
        console.error("❌ [GIF ENGINE] Critical failure:", err.message);
    }

    return "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3RreXQ0Z3RqZ3RreXQ0Z3RqZ3RreXQ0Z3RqZ3RreXQ0Z3ImZXA9djFfZ2lmc19zZWFyY2gmY3Q9Zw/3o7TKP9ln2DrM3hAS4/giphy.gif";
}

module.exports = { getGif };
