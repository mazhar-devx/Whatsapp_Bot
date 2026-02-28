const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function run() {
    const q = "adele hello";
    const ytUrl = "https://www.youtube.com/watch?v=YQHsXMglC9A";

    console.log("1. Testing Ryzendesu...");
    try {
        const res = await fetch(`https://ryzendesu.vip/api/downloader/ytmp3?url=${ytUrl}`);
        const data = await res.json();
        console.log("Ryzen MP3:", data?.url || "Failed");
    } catch (e) { console.log("Err:", e.message); }

    console.log("2. Testing Gifted API (Search)...");
    try {
        const res = await fetch(`https://api.giftedtech.my.id/api/download/ytdl?url=${ytUrl}&apikey=gifted`);
        const data = await res.json();
        console.log("Gifted Audio:", data?.result?.audio_url || "Failed");
        console.log("Gifted Video:", data?.result?.video_url || "Failed");
    } catch (e) { console.log("Err:", e.message); }

    console.log("3. Testing Siputzx...");
    try {
        const res = await fetch(`https://api.siputzx.my.id/api/d/ytmp3?url=${ytUrl}`);
        const data = await res.json();
        console.log("Siputzx MP3:", data?.data?.dl || "Failed");
    } catch (e) { console.log("Err:", e.message); }

    console.log("4. Testing Siputzx Video...");
    try {
        const res = await fetch(`https://api.siputzx.my.id/api/d/ytmp4?url=${ytUrl}`);
        const data = await res.json();
        console.log("Siputzx MP4:", data?.data?.dl || "Failed");
    } catch (e) { console.log("Err:", e.message); }
}
run();
