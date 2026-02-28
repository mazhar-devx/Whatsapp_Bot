const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

/**
 * MULTI-API GIF ENGINE
 * Uses multiple sources to ensure GIFs are ALWAYS found.
 */
async function getGif(query) {
    const q = (query || "happy").toLowerCase();
    const categories = ["smile", "wave", "happy", "dance", "laugh", "hug", "wink", "pat", "bonk", "yeet", "bully", "slap", "kill", "cringe", "cuddle", "cry"];
    let category = categories.find(c => q.includes(c)) || "smile";

    // --- FIX: Map unsupported categories for waifu.pics ---
    if (category === "laugh") category = "smile";
    if (category === "cringe") category = "smug"; // alternative

    console.log(`🎬 [GIF ENGINE] Searching Sources... Category: ${category}`);

    // SOURCE 1: waifu.pics
    try {
        const res = await fetch(`https://api.waifu.pics/sfw/${category}`);
        if (res.ok) {
            const data = await res.json();
            return data.url;
        }
    } catch (err) {
        console.warn("⚠️ [GIF] Source 1 failed, trying Source 2...");
    }

    // SOURCE 2: otakugif.xyz (Fallback API)
    try {
        const res = await fetch(`https://api.otakugif.xyz/gif?reaction=${category}`);
        if (res.ok) {
            const data = await res.json();
            return data.url;
        }
    } catch (err) {
        console.error("❌ [GIF ENGINE] All APIs failed.");
    }

    // FINAL FALLBACK: Giphy Public Link
    return "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3RreXQ0Z3RqZ3RreXQ0Z3RqZ3RreXQ0Z3RqZ3RreXQ0Z3ImZXA9djFfZ2lmc19zZWFyY2gmY3Q9Zw/3o7TKP9ln2DrM3hAS4/giphy.gif";
}

module.exports = { getGif };
