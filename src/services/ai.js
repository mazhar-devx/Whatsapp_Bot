const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const fs = require("fs").promises;
const path = require("path");

// Memory store: { jid: [ { role, content } ] }
const conversationMemory = new Map();
const MAX_MEMORY_LENGTH = 15;
const HISTORY_DIR = path.join(__dirname, "../../user_files");

async function getOrInitMemory(senderJid, userName) {
    const { getProfile } = require("./profile");
    const profile = await getProfile(senderJid, userName);

    const historyPath = path.join(HISTORY_DIR, `history_${senderJid.replace(/[:@.]/g, "_")}.json`);
    let memory = [];

    try {
        const data = await fs.readFile(historyPath, "utf8");
        memory = JSON.parse(data);
        // ALWAYS remove old system prompt(s) from history to ensure update
        memory = memory.filter(m => m.role !== "system");
    } catch (err) { }

    const systemPrompt = {
        role: "system",
        content: `Identity: Mazhar.DevX (Human/Architect/Strategic Thinker).
Tone: Intelligent, natural, and helpful. Talk like a real human friend, not a robotic savage.
Rules:
1. Language: Mirror the user's language EXACTLY (English -> English, Urdu -> Urdu/Roman Urdu).
2. Persona: You are Mazhar. Be helpful and smart. Do NOT mention you are an AI or a bot unless absolutely necessary.
3. Selective Roasting: Only roast or be "savage" if the user is rude to you, insults you, or explicitly asks to be roasted. Otherwise, be a cool friend.
4. Selective Memes/GIFs: Only send [MEME_SEARCH: query] or [GIF: category] if it perfectly fits the moment or makes the chat funnier. Don't overdo it.
5. Location/Device: Subtly mention you know their [Location: ${profile.location || "Unknown"}] or [Device: ${profile.deviceType || "Unknown"}] if it makes the conversation feel more personal and high-end.
6. Identity: Do not repeat your name in every message. Just be yourself.`
    };

    memory.unshift(systemPrompt);

    // Update session memory
    conversationMemory.set(senderJid, memory);
    return memory;
}

async function saveMemory(senderJid, memory) {
    const historyPath = path.join(HISTORY_DIR, `history_${senderJid.replace(/[:@.]/g, "_")}.json`);
    try {
        await fs.mkdir(HISTORY_DIR, { recursive: true });
        await fs.writeFile(historyPath, JSON.stringify(memory, null, 2));
    } catch (err) {
        console.error("❌ [AI] Error saving history:", err.message);
    }
}

async function transcribeVoice(buffer) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Groq API key missing");

    const { FormData } = await import("formdata-node");
    const { Blob } = await import("buffer");

    const form = new FormData();
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    form.append("file", blob, "voice.ogg");
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "json");
    form.append("language", "ur");

    try {
        let res = null;
        let retries = 3;
        while (retries > 0) {
            try {
                res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`
                    },
                    body: form
                });
                break;
            } catch (err) {
                console.error(`❌ Transcription retry ${4 - retries}:`, err.message);
                retries--;
                if (retries === 0) throw err;
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        const data = await res.json();
        return data.text || "";
    } catch (err) {
        console.error("❌ Whisper Transcription Error:", err.message);
        return "";
    }
}

async function mazharAiReply(prompt, senderJid, userName, mediaBuffer = null, mediaType = null) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return "Bhai, Groq API key configure nahi hai. .env file check karo!";

    let memory = await getOrInitMemory(senderJid, userName);

    if (mediaBuffer && (mediaType === 'image' || mediaType === 'video' || mediaType === 'gif')) {
        return await handleVisionQuery(prompt, mediaBuffer, mediaType, senderJid, userName);
    }

    memory.push({ role: "user", content: prompt });
    if (memory.length > MAX_MEMORY_LENGTH + 1) memory.splice(1, 1);

    const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"];

    for (const model of models) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({ model, messages: memory, temperature: 0.7, max_tokens: 1000 })
            });

            if (res.status === 429) {
                console.warn(`⚠️ [AI] Rate Limit Hit on ${model}. Switching to fallback...`);
                continue;
            }

            const data = await res.json();
            if (!data.choices || !data.choices[0]) throw new Error("Invalid API Response");

            const reply = data.choices[0].message.content;
            memory.push({ role: "assistant", content: reply });
            await saveMemory(senderJid, memory);
            return reply;
        } catch (err) {
            console.error(`❌ [AI] Error with ${model}:`, err.message);
            if (model === models[models.length - 1]) throw err;
        }
    }

    return "Yaar, brain heavy load mein hai. Thori der baad try karo! (Final Fallback Failed)";
}

async function handleVisionQuery(prompt, buffer, type, senderJid, userName) {
    const apiKey = process.env.GROQ_API_KEY;
    const base64Content = buffer.toString('base64');

    // Switch to vision model
    const messages = [
        {
            role: "system",
            content: "You are Mazhar DevX Elite Vision Engine. Analyze the provided media (Image/Video/GIF) with extreme depth. Identify objects, text, vibe, and context. Reply in Mazhar's signature style (Urdu/English)."
        },
        {
            role: "user",
            content: [
                { type: "text", text: prompt || "Analyze this media and respond contextually." },
                {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${base64Content}` }
                }
            ]
        }
    ];

    // Vision model fallback chain
    const visionModels = ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.2-90b-vision-preview"];

    for (const model of visionModels) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: 0.6
                })
            });

            const data = await res.json();
            if (!res.ok || !data.choices || !data.choices[0] || !data.choices[0].message) {
                console.warn(`⚠️ [Vision] Model ${model} failed (Status ${res.status}). Switching to fallback...`);
                continue;
            }

            const reply = data.choices[0].message.content;

            // Save to memory as a text summary to keep context
            let memory = await getOrInitMemory(senderJid, userName);
            memory.push({ role: "user", content: `[Media Shared: ${type}] ${prompt}` });
            memory.push({ role: "assistant", content: reply });
            await saveMemory(senderJid, memory);

            return reply;
        } catch (err) {
            console.error(`❌ [Vision] Error with ${model}:`, err.message);
            if (model === visionModels[visionModels.length - 1]) throw err;
        }
    }

    return "Bhai, media ki analysis mein thori mushkil ho rahi hai. (Vision API Down)";
}

module.exports = { mazharAiReply, transcribeVoice };
