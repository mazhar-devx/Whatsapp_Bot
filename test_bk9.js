const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function run() {
    try {
        console.log("Searching BK9...");
        const res = await fetch("https://bk9.fun/search/yts?q=hello+adele");
        const json = await res.json();
        const first = json.BK9?.[0];
        console.log("Found:", first.title, first.url);

        const aRes = await fetch(`https://bk9.fun/download/ytmp3?url=${first.url}`);
        const aJson = await aRes.json();
        console.log("Audio URL:", aJson.BK9.dl);

        const vRes = await fetch(`https://bk9.fun/download/ytmp4?url=${first.url}`);
        const vJson = await vRes.json();
        console.log("Video URL:", vJson.BK9.dl);
    } catch (err) {
        console.error("BK9 Err:", err.message);
    }
}
run();
