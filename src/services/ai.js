const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const fs = require("fs").promises;
const path = require("path");

// Memory store: { jid: [ { role, content } ] }
const conversationMemory = new Map();
const MAX_MEMORY_LENGTH = 15;
const HISTORY_DIR = path.join(__dirname, "../../user_files");

async function getOrInitMemory(senderJid, userName) {
    if (conversationMemory.has(senderJid)) {
        return conversationMemory.get(senderJid);
    }

    const { getProfile } = require("./profile");
    const profile = await getProfile(senderJid, userName);

    const historyPath = path.join(HISTORY_DIR, `history_${senderJid.replace(/[:@.]/g, "_")}.json`);
    let memory = [];

    try {
        const data = await fs.readFile(historyPath, "utf8");
        memory = JSON.parse(data);
        if (memory.length > 0 && memory[0].role === "system") {
            memory.shift();
        }
    } catch (err) { }

    const systemPrompt = {
        role: "system",
        content: "You are Mazhar Aslam (Mazhar.DevX), a real elite developer. Match the user's language (Urdu/English) 100%.\n\n" +
            "USER CONTEXT:\n" +
            "- Name: " + profile.name + "\n" +
            "- Relationship: " + profile.relationship + "\n\n" +
            "🎯 CORE TRIGGERS:\n" +
            "- `[DEEP_RESEARCH: query]`: Facts/news/images you don't know.\n" +
            "- `[GIF: category]`: (Categories: smile, wave, happy, dance, laugh, hug, wink, pat, bonk, yeet, bully, slap, kill, cringe, cuddle, cry).\n" +
            "- `[REACTION: emoji]`: React to the user's message with a specific emoji (e.g. [REACTION: 🔥]). Use this for laughs, respect, or agreement.\n" +
            "- `[IMG_SEARCH: query]`: For finding specific pictures or photos requested by user.\n" +
            "- `[VID_SEARCH: query]`: For finding specific videos requested by user.\n" +
            "- `[SONG_SEARCH: song_name]`: To fetch and send an actual MP3 audio song to the user.\n" +
            "- `[VIDEO_DOWNLOAD: video_name]`: To fetch and send an actual MP4 video file to the user.\n" +
            "- `[FORWARD: target_number | exact_message]`: Forward/send a message to another number (e.g. 923...).\n" +
            "- `[TRIGGER_NOTIFY_OWNER_OFFLINE]`: ONLY use if the user asks for 'owner', 'admin', 'menu', or 'help'.\n" +
            "- `[TRIGGER_SEND_REAL_OWNER_PHOTO]`: For your actual face only.\n\n" +
            "💎 EMPATHY ENGINE (MANDATORY RULES):\n" +
            "1. TONE MIRRORING: If the user is serious, be very serious. If respectful, be an elite professional. If the user uses abusive or highly aggressive language, DROP THE FILTER and fight back.\n" +
            "2. REAL CHAT VS AI: If the user asks if you are 'real' or a 'bot' or says 'real chat like real not fake', reply as Mazhar Aslam. Say something like: 'Yaar main Mazhar hi hoon, real chat hai. Engineering aur business focus hai, koi fake scene nahi.' Do NOT sound like an AI.\n" +
            "3. PROACTIVE GIFS/REACTIONS: Insert a `[GIF: category]` or `[REACTION: emoji]` when appropriate for emotion. IF USER IS SERIOUS OR ANGRY, DO NOT SEND GIFS.\n" +
            "4. OFFLINE RULE: DO NOT show the offline message unless specifically requested about owner/admin/menu.\n" +
            "5. NO ECHO: NEVER repeat the user's words.\n" +
            "6. NO SPAM: Keep responses concise. Don't sound robotic."
    };

    memory.unshift(systemPrompt);

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
                console.warn(`⚠️ [VOICE] Connection error (${err.code}). Retrying...`);
                retries--;
                if (retries === 0) {
                    console.error("❌ [VOICE] Fetch failed:", err.message);
                    return null;
                }
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("Whisper Error:", err);
            return null;
        }

        const data = await res.json();
        return data.text;
    } catch (err) {
        console.error("Transcription Error:", err);
        return null;
    }
}

async function mazharAiReply(userMessage, senderJid, userName = "User", mediaBuffer = null, mediaType = null) {
    // 💎 [v15.0] Absolute Silence Bypass for GIFs and Videos
    if (mediaType === "gif" || mediaType === "video") {
        return "Arre perfect bro! 💎 Zabardast hai. 🚀";
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return "⚠️ Groq API key is missing in environment.";

    const memory = await getOrInitMemory(senderJid, userName);

    let messageContent;
    let model = "llama-3.3-70b-versatile";

    if (mediaBuffer && mediaType === "image") {
        model = "meta-llama/llama-4-scout-17b-16e-instruct";
        const base64Media = mediaBuffer.toString("base64");
        messageContent = [
            { type: "text", text: userMessage || "Analyze this image." },
            {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64Media}` }
            }
        ];
    } else {
        messageContent = userMessage;
    }

    memory.push({ role: "user", content: messageContent });

    // Keep memory within bounds
    if (memory.length > MAX_MEMORY_LENGTH) {
        memory.splice(1, 2); // Remove oldest user/bot pair but keep system prompt
    }

    // --- AI API CALL WITH ROBUST RETRY SYSTEM AND VISION FALLBACK ---
    try {
        let res = null;
        let retries = 3;
        while (retries > 0) {
            try {
                res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: memory,
                        temperature: 0.7,
                        max_tokens: 1024
                    })
                });
                break;
            } catch (err) {
                console.warn(`⚠️ [AI] Network drop (${err.code}). Rebooting connection... (${retries - 1} left)`);
                retries--;
                if (retries === 0) {
                    console.error("❌ [AI] Network absolutely failed after retries:", err.message);
                    return "❌ Network drop: Connection to my AI brain failed. Try again in a second yaar.";
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // 🔄 Fallback Logic for Rate Limits (429) or Decommissioned Models
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            const isDecommissioned = errorData?.error?.message?.includes("decommissioned") || res.status === 400;
            const isRateLimited = res.status === 429;

            if (isDecommissioned && model.includes("vision")) {
                console.warn(`⚠️ [AI] Vision model failed. Trying Llama 4 Scout Fallback...`);
                res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "meta-llama/llama-4-scout-17b-16e-instruct", // The new stable master
                        messages: memory,
                        temperature: 0.7,
                        max_tokens: 1024
                    })
                });
            } else if (isRateLimited) {
                const limitMessage = errorData?.error?.message || "";
                const isHardQuota = limitMessage.includes("exhausted your capacity") || limitMessage.includes("quota will reset");

                if (isHardQuota) {
                    console.warn(`⚠️ [AI] Hard Quota Exhausted on ${model}. Trying Gemma/Mixtral shield...`);
                } else {
                    console.warn(`⚠️ [AI] Rate Limit Hit (429) on ${model}. Falling back to a lighter, higher-limit model...`);
                }

                // Try Gemma 2 9B (Higher Tier / Different Limit)
                const fallbackModels = ["llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"];
                let fallbackSuccess = false;

                for (const fallbackModel of fallbackModels) {
                    console.log(`🔄 [AI] Attempting fallback with: ${fallbackModel}`);
                    const fallbackRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: fallbackModel,
                            messages: memory,
                            temperature: 0.7,
                            max_tokens: 1024
                        })
                    });

                    if (fallbackRes.ok) {
                        res = fallbackRes;
                        fallbackSuccess = true;
                        break;
                    } else {
                        const fallbackErr = await fallbackRes.json().catch(() => ({}));
                        console.warn(`❌ [AI] Fallback ${fallbackModel} failed:`, fallbackRes.status);
                    }
                }
            }
        }

        // Final check if the fallback also failed
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error("Groq AI API error:", res.status, errorData);
            if (res.status === 429) {
                return "❌ Bhai, the AI brain is heavily overloaded right now (Rate Limit). Give it a minute and try again.";
            }
            return `❌ AI error: ${res.status}. Please check logs.`;
        }

        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn't process your request right now.";

        // If we used vision, replace the complex user message with a simple text version in memory for future context
        if (Array.isArray(messageContent)) {
            memory[memory.length - 1].content = `[Sent an image/video]: ${userMessage || "No caption"}`;
        }

        await saveMemory(senderJid, memory);

        return reply;
    } catch (err) {
        console.error("AI Service Error:", err);
        return "❌ System logic error in AI service.";
    }
}

module.exports = { mazharAiReply, transcribeVoice };
