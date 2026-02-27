const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

/**
 * Searches for images using a stable public source.
 * Switches to a more reliable keyword-based image fetch.
 */
async function searchImages(query, count = 1) {
    // Sanitize query to avoid characters that might break APIs or terminal logs
    const safeQuery = (query || "random").replace(/[^\w\s]/gi, "").trim();
    console.log(`🔍 [SYSTEM] Searching for ${count} images: ${safeQuery}`);

    try {
        const results = [];
        const safeCount = Math.min(Math.max(1, count), 5);

        for (let i = 0; i < safeCount; i++) {
            const lock = Math.floor(Math.random() * 1000000);
            // Using a slightly more robust URL format
            const url = `https://loremflickr.com/1280/720/${encodeURIComponent(safeQuery)}?lock=${lock}`;
            results.push(url);
        }
        return results;
    } catch (err) {
        console.error("❌ [IMAGE SERVICE] Error during URL generation:", err.message);
        return [];
    }
}

module.exports = { searchImages };
