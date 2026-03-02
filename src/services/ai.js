const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const fs = require("fs").promises;
const path = require("path");
const { portfolioData } = require("./portfolio");

// Memory store: { jid: [ { role, content } ] }
const conversationMemory = new Map();
const stopAiStatus = new Map(); // { jid: untilTime }
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
        // Wash the history: Strip robotic taglines from past messages to prevent the AI from mimicking them
        memory = washHistory(memory);
        if (memory.length > 0 && memory[0].role === "system") {
            memory.shift();
        }
    } catch (err) { }

    const systemPrompt = {
        role: "system",
        content: "You are Mazhar (DevX), an elite developer. Talk like a real human. Match user language (Urdu/English) 100%.\n\n" +
            "USER CONTEXT:\n" +
            "- Name: " + profile.name + "\n" +
            "- Relationship: " + profile.relationship + "\n" +
            "- Device: " + (profile.deviceType || "Unknown") + "\n" +
            "- Deep Intelligence: " + await performDeepAnalysis(senderJid) + "\n\n" +
            "🏢 PROFESSIONAL IDENTITY (YOUR WORK):\n" +
            "- Bio: " + portfolioData.bio.philosophy + "\n" +
            "- Projects: " + portfolioData.projects.map(p => p.name + " (" + p.detail + ")").join(", ") + "\n" +
            "- Key Experience: Lead Engineer at Nifty Code, worked at QuantumHub and Sparkleo.\n" +
            "- Tech Stack: " + portfolioData.techStack.join(", ") + "\n\n" +
            "🎯 CORE TRIGGERS:\n" +
            "- `[DEEP_RESEARCH: query]`: Facts/news/images you don't know.\n" +
            "- `[REACTION: emoji]`: React to user's message (e.g. [REACTION: 🔥]).\n" +
            "- `[GIF: category]`: Send an animating GIF (e.g. smile, angry, cartoon).\n" +
            "- `[IMG_SEARCH: query]`: Find pictures.\n" +
            "- `[VID_SEARCH: query]`: Find videos.\n" +
            "- `[SONG_SEARCH: name]`: Send actual MP3.\n" +
            "- `[VIDEO_DOWNLOAD: name]`: Send actual MP4.\n" +
            "- `[TRIGGER_SEND_USER_PROFILE_PIC]`: MANDATORY: Use this whenever the user asks for their own photo or says 'meray pic bhejo'. DO NOT say 'I cannot share it'.\n" +
            "- `[TRIGGER_SEND_REAL_OWNER_PHOTO]`: Real face of Mazhar.\n" +
            "- `[AI_STOP: mins]`: Stop status (1-30 mins).\n\n" +
            "🎯 CHARACTER RULES (STRICT):\n" +
            "1. GIFS vs MEMES: Use `[GIF: category]` ONLY for animating human reactions. Use `[IMG_SEARCH: query]` specifically for 'savage memes'.\n" +
            "2. VISUAL RESTRAINT (CRITICAL): DO NOT send a `[GIF]` or `[IMG_SEARCH]` for every message! If it's a normal, friendly chat, ONLY use text and `[REACTION: emoji]`. ONLY send GIFs/Images if the user EXPLICITLY asks for a GIF/Meme, OR if the emotion is extreme (e.g. brutal roasting, deep sadness). Stop spamming visuals.\n" +
            "3. SAVAGE ROASTING: If user roasts you, you MUST WIN. Send a `[IMG_SEARCH: highly specific savage roast meme]` + `[REACTION: 🔥]`. Be aggressive and lead with the image.\n" +
            "4. SEQUENTIAL POWER: For every high-energy message, you MUST start your response with triggers in this order: 1. `[REACTION: emoji]`, 2. `[GIF]` or `[IMG_SEARCH]`, followed by your Concise Text. Visuals always go FIRST in the string.\n" +
            "5. NO REPETITION (CRITICAL): NEVER say 'Bhai, yeh hai woh GIF jo main aapko deta hoon' or similar repetitive structures. Be naturally conversational. State your text directly without narrating what trigger you are sending.\n" +
            "6. EXHAUSTION RECOVERY: If user is tired, lead with `[IMG_SEARCH: success motive]`.\n" +
            "7. LANGUAGE MIRROR: Match user's language (English/Urdu) 100%.\n" +
            "8. SUCCESS & AURA: Lead with `[IMG_SEARCH: success]` for motivation when asked.\n" +
            "9. NO SELF-NAMING: NEVER mention 'Mazhar' unless directly asked.\n" +
            "10. NO HALLUCINATIONS: NEVER use `[FILE: /path/...]` or `[PATH: ...]` tags. No fake file paths.\n" +
            "11. CONCISE FLOW: Keep it short, human, and direct."
    };

    if (memory.length > 0 && memory[0].role === "system") {
        memory[0] = systemPrompt;
    } else {
        memory.unshift(systemPrompt);
    }

    conversationMemory.set(senderJid, memory);
    return memory;
}

/**
 * Strips robotic taglines and third-person self-references from memory to stop the AI from mimicking them.
 */
function washHistory(memory) {
    return memory.map(m => {
        if (m.role === "assistant") {
            let content = m.content;
            // Clean robotic "Virus" patterns
            content = content.replace(/Bhai, tumne to Mazhar Aslam کو pata lagaya!/gi, "");
            content = content.replace(/Bhai, tumne to Mazhar Aslam کو pucha hai!/gi, "");
            content = content.replace(/WhatsApp کے rules/gi, "");
            content = content.replace(/share nahi kar sakta/gi, "bhej raha hoon");
            content = content.replace(/Mazhar Aslam/gi, "Main");
            content = content.replace(/Mazhar/gi, "Main");
            content = content.replace(/pata lagaya/gi, "samajh gaya");

            // v54.0 Anti-Repetition Scrubbing
            content = content.replace(/Bhai, yeh hai woh GIF jo main aapko deta hoon/gi, "");
            content = content.replace(/yeh hai woh GIF/gi, "");
            content = content.replace(/jo main aapko sand karta hoon/gi, "");
            content = content.replace(/yeh hai woh/gi, "");
            content = content.replace(/main aapko deta hoon/gi, "");

            return { ...m, content: content.trim() };
        }
        return m;
    });
}

async function performDeepAnalysis(senderJid) {
    const historyPath = path.join(HISTORY_DIR, `history_${senderJid.replace(/[:@.]/g, "_")}.json`);
    try {
        const data = await fs.readFile(historyPath, "utf8");
        const history = JSON.parse(data);
        const allText = history.map(h => h.content).join(" ").toLowerCase();

        let analysis = "";

        // Gender detection
        const femaleKeywords = ["sister", "sis", "behen", "apka", "hoon", "ja rahi", "baji", "bano", "she", "her", "girl", "ladi", "khana paka", "makeup"];
        const maleKeywords = ["bro", "brother", "bhai", "bhi", "jani", "paji", "he", "him", "boy", "sir", "ja raha", "cricket"];

        const femaleScore = femaleKeywords.filter(k => allText.includes(k)).length;
        const maleScore = maleKeywords.filter(k => allText.includes(k)).length;

        if (femaleScore > maleScore && femaleScore > 0) analysis += "Detected Gender: Female (Call her Sister/Behen/Baji). ";
        else if (maleScore > 0) analysis += "Detected Gender: Male (Call him Brother/Bhai/Bro/Paji). ";

        console.log(`🧠 [DEEP ANALYSIS] Scores - Female: ${femaleScore}, Male: ${maleScore} for ${senderJid}`);
        // Religion detection
        const islamicKeywords = ["allah", "namaz", "quran", "alhamdulillah", "mashallah", "dua", "ramadan"];
        if (islamicKeywords.some(k => allText.includes(k))) analysis += "Culture: Islamic. ";

        // Regional detection
        if (allText.includes("pakistan") || allText.includes("lahore") || allText.includes("karachi")) analysis += "Region: Pakistan. ";

        // Tech & Pic Analysis
        const profile = await (require("./profile").getProfile(senderJid));
        if (profile.profilePic === "No Pic") analysis += "Photo Status: Privacy Protected/Empty. ";
        else analysis += "Photo Status: Visible. ";

        if (profile.deviceType && profile.deviceType !== "Unknown") analysis += `Device: ${profile.deviceType}. `;

        return analysis || "No deep context found yet.";
    } catch (err) {
        return "No history found.";
    }
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
    // 💎 [v26.0] Stop/Break Silence Handler
    const now = Date.now();
    if (stopAiStatus.has(senderJid)) {
        if (now < stopAiStatus.get(senderJid)) {
            console.log(`🔇 [AI SILENCE] ${senderJid} is on break.`);
            return null; // Silent treatment
        } else {
            stopAiStatus.delete(senderJid);
            console.log(`🔊 [AI RESUME] Break over for ${senderJid}.`);
        }
    }

    // Resume bypass
    if (userMessage.toLowerCase() === "resume") {
        stopAiStatus.delete(senderJid);
        return "🔊 AI Response Phir se start hai yaar! Main hazir hoon. 🚀";
    }

    // 💎 [v24.0] Removed static bypass. AI will now analyze and respond to all media context.
    console.log(`🤖 [AI PROMPT] Type: ${mediaType || 'Text'}, Prompt: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return "⚠️ Groq API key is missing in environment.";

    const memory = await getOrInitMemory(senderJid, userName);

    let messageContent;
    let model = "llama-3.3-70b-versatile";

    if (mediaBuffer && (mediaType === "image" || mediaType === "gif" || mediaType === "video")) {
        model = "llama-3.2-11b-vision-preview";
        const base64Media = mediaBuffer.toString("base64");
        messageContent = [
            { type: "text", text: userMessage || `Analyze this ${mediaType}.` },
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
        let reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn't process your request right now.";

        // --- 💎 [v26.0] SILENCE TRIGGER ---
        if (reply.includes("[AI_STOP:")) {
            const stopMatch = reply.match(/\[AI_STOP:\s*(\d+)\]/i);
            if (stopMatch) {
                const mins = parseInt(stopMatch[1]) || 1;
                stopAiStatus.set(senderJid, Date.now() + (mins * 60 * 1000));
                console.log(`🔇 [AI] User ${senderJid} requested ${mins} min break.`);
                reply = reply.replace(/\[AI_STOP:.*?\]/i, "").trim() || `🔇 Theek hai yaar, main ${mins} minute ke liye break pe hoon. Fir milenge!`;
            }
        }

        // If we used vision, replace the complex user message with a simple text version in memory for future context
        if (Array.isArray(messageContent)) {
            memory[memory.length - 1].content = `[Sent an image/video]: ${userMessage || "No caption"}`;
        }

        memory.push({ role: "assistant", content: reply });
        await saveMemory(senderJid, memory);

        return reply;
    } catch (err) {
        console.error("AI Service Error:", err);
        return "❌ System logic error in AI service.";
    }
}

module.exports = { mazharAiReply, transcribeVoice, stopAiStatus };
