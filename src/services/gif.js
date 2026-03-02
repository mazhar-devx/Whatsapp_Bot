/**
 * MULTI-API GIF ENGINE
 * Uses multiple sources to ensure GIFs are ALWAYS found.
 */
async function getGif(query) {
    const q = (query || "happy").toLowerCase();
    const categories = ["smile", "wave", "happy", "dance", "laugh", "hug", "wink", "pat", "bonk", "yeet", "bully", "slap", "kill", "cringe", "cuddle", "cry", "love", "angry", "surprised", "thinking", "success", "motivation", "cartoon"];
    let category = categories.find(c => q.includes(c)) || "smile";

    // --- FIX: Map unsupported categories for waifu.pics ---
    if (category === "laugh") category = "smile";
    if (category === "cringe" || category === "thinking") category = "smug";
    if (category === "success" || category === "motivation") category = "happy";
    if (category === "angry" || category === "cartoon") category = "bully"; // Anime-style reaction for cartoon
    console.log(`🎬 [GIF ENGINE] Searching Sources... Category: ${category}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s strict timeout

    // --- [v53.0 TRUE MP4 GIF INTEGRATION] ---
    // SOURCE 0: Tenor API (Native MP4 GIFs)
    try {
        console.log("📡 [GIF] Fetching from Tenor API (MP4)...");
        // Using a public Tenor API key for search
        const tenorParams = new URLSearchParams({
            q: category,
            key: "LIVDSRZULELA", // Common public Tenor Key
            limit: "10"
        });
        const tenorRes = await fetch(`https://api.tenor.com/v1/search?${tenorParams}`, { signal: controller.signal });
        if (tenorRes.ok) {
            const data = await tenorRes.json();
            if (data.results && data.results.length > 0) {
                // Randomize selection
                const topResults = data.results.slice(0, 5);
                topResults.sort(() => 0.5 - Math.random());
                const mediaObject = topResults[0].media[0];

                // Prioritize tinywebm/mp4 for animation
                const mp4Url = mediaObject.mp4 ? mediaObject.mp4.url : (mediaObject.tinywebm ? mediaObject.tinywebm.url : mediaObject.gif.url);
                // Flag if it's explicitly an MP4 so message.js knows how to send it natively
                const isMp4 = mp4Url.endsWith('.mp4');

                console.log(`✅ [GIF] Source 0 (Tenor) Link: ${mp4Url}`);
                clearTimeout(timeout);
                return { url: mp4Url, isMp4 };
            }
        }
    } catch (err) {
        console.warn("⚠️ [GIF] Source 0 (Tenor) failed/timed out, trying Source 1...");
    }

    // --- [ORIGINAL CODE PRESERVED BELOW] ---
    // SOURCE 1: waifu.pics
    try {
        console.log("📡 [GIF] Fetching from waifu.pics...");
        const res = await fetch(`https://api.waifu.pics/sfw/${category}`, { signal: controller.signal });
        console.log(`📡 [GIF] waifu.pics status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`✅ [GIF] Source 1 Link: ${data.url}`);
            clearTimeout(timeout);
            return { url: data.url, isMp4: false };
        }
    } catch (err) {
        console.warn("⚠️ [GIF] Source 1 failed/timed out, trying Source 2...");
    }

    // SOURCE 2: otakugif.xyz (Fallback API)
    try {
        console.log("📡 [GIF] Fetching from otakugif.xyz...");
        const res = await fetch(`https://api.otakugif.xyz/gif?reaction=${category}`, { signal: controller.signal });
        console.log(`📡 [GIF] otakugif.xyz status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`✅ [GIF] Source 2 Link: ${data.url}`);
            clearTimeout(timeout);
            return { url: data.url, isMp4: false };
        }
    } catch (err) {
        console.warn("⚠️ [GIF] Source 2 failed/timed out, trying Source 3...");
    }

    // SOURCE 3: nekos.best (New API Expansion v52.0)
    try {
        console.log("📡 [GIF] Fetching from nekos.best...");

        // Map category to a valid nekos.best reaction if needed
        let nekoCategory = category;
        if (category === "angry" || category === "bully") nekoCategory = "baka";
        if (category === "happy" || category === "smile") nekoCategory = "happy";

        const res = await fetch(`https://nekos.best/api/v2/${nekoCategory}`, { signal: controller.signal });
        console.log(`📡 [GIF] nekos.best status: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                console.log(`✅ [GIF] Source 3 Link: ${data.results[0].url}`);
                clearTimeout(timeout);
                return { url: data.results[0].url, isMp4: false };
            }
        }
    } catch (err) {
        console.error("❌ [GIF ENGINE] All 3 APIs failed or timed out.");
    } finally {
        clearTimeout(timeout);
    }

    // FINAL FALLBACK: Giphy Public Link
    return { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3RreXQ0Z3RqZ3RreXQ0Z3RqZ3RreXQ0Z3RqZ3RreXQ0Z3ImZXA9djFfZ2lmc19zZWFyY2gmY3Q9Zw/3o7TKP9ln2DrM3hAS4/giphy.gif", isMp4: false };
}

module.exports = { getGif };
