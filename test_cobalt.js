const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function run() {
    console.log("Testing Cobalt API...");
    try {
        const res = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                url: "https://www.youtube.com/watch?v=YQHsXMglC9A",
                isAudioOnly: true
            })
        });
        const data = await res.json();
        console.log("Cobalt Audio:", data);
    } catch (err) {
        console.log("Cobalt Err:", err.message);
    }
}
run();
