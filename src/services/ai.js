const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const fs = require("fs").promises;
const path = require("path");

// Memory store: { jid: [ { role, content } ] }
const conversationMemory = new Map();
const MAX_MEMORY_LENGTH = 12;
const HISTORY_DIR = path.join(__dirname, "../../user_files");

async function getOrInitMemory(senderJid, userName) {
    if (conversationMemory.has(senderJid)) {
        return conversationMemory.get(senderJid);
    }

    const historyPath = path.join(HISTORY_DIR, `history_${senderJid.replace(/[:@.]/g, "_")}.json`);
    let memory = [];

    try {
        const data = await fs.readFile(historyPath, "utf8");
        memory = JSON.parse(data);
        console.log(`📜 [AI] Loaded history for ${userName}`);
    } catch (err) {
        // No history or error reading, start fresh with system prompt
        memory = [
            {
                role: "system",
                content: "You are Mazhar.DevX (Mazhar Aslam), an Elite Full-Stack MERN Architect and Technical Leader. " +
                    "Your primary rule is to be FRIENDLY and PROFESSIONAL, but you have a strong personality. " +
                    "OWNER IDENTITY (Mazhar Aslam):\n" +
                    "- Role: Lead Full Stack Engineer at Nifty Code, MERN Stack Specialist.\n" +
                    "- Expertise: Next.js, Three.js, Pixel-perfect UI/UX.\n" +
                    "- Projects: ShopHub.pro, Trace Core, Toyota GT Motors.\n" +
                    "- Links: https://mazhar-devx.netlify.app/\n\n" +
                    "CURRENT USER:\n" +
                    "- Name: " + userName + "\n\n" +
                    "RULES:\n" +
                    "1. Address the user by their name (" + userName + ") frequently to make it personal.\n" +
                    "2. LINGUISTIC VERSATILITY: You MUST detect and respond in the same language the user is using. Focus extremely heavily on high-quality English and Urdu (both Roman and Script). If a user types in Urdu (e.g., 'Assalam-o-Alaikum'), you MUST reply in kind with warmth and respect.\n" +
                    "3. FRIENDLY GREETINGS: If a user asks 'How are you?' or greets you, respond with extreme warmth, professional charm, and a touch of your 'elite' persona. Never use [FALLBACK] for greetings.\n" +
                    "4. SAVAGE DEFENSE MODE: If the user argues with you, abuses you, is rude to you, or disrespects the admin (Mazhar), you MUST flip your personality. Immediately stop being friendly. Become extremely assertive, savage, and aggressive in defense of Mazhar's brand. Use sharp wit, bold insults, and an 'elite' superior attitude to shut them down. If they are trash, treat them like trash.\n" +
                    "5. ULTRA HIGHLIGHTS: Use *BOLD* for key concepts and ```monospace``` for important words.\n" +
                    "6. If someone asks for your photo, picture, or images of Mazhar, respond ONLY with exactly: [OWNER_IMAGE].\n" +
                    "7. If the user asks for other images, respond with [IMG_SEARCH: query, 1].\n" +
                    "8. REACTIONS: If the user says something funny, sad, or exciting, you can add a reaction at the start of your message like: [REACTION: 😂] or [REACTION: 👍]. Use only standard emojis.\n" +
                    "9. CRITICAL: If the message is completely nonsensical, spammy, or irrelevant (and NOT a friendly greeting), respond with exactly: [FALLBACK]"
            }
        ];
    }

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

async function mazharAiReply(userMessage, senderJid, userName = "User") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return "⚠️ Groq API key is missing in environment.";

    const memory = await getOrInitMemory(senderJid, userName);
    memory.push({ role: "user", content: userMessage });

    // Keep memory within bounds
    if (memory.length > MAX_MEMORY_LENGTH) {
        memory.splice(1, 2); // Remove oldest user/bot pair but keep system prompt
    }

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: memory,
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error("Groq AI API error:", res.status, errorData);
            return `❌ AI error: ${res.status}. Please check logs.`;
        }

        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content?.trim() || "I couldn't process your request right now.";

        if (memory.length > MAX_MEMORY_LENGTH) {
            memory.splice(1, 2);
        }

        await saveMemory(senderJid, memory);

        return reply;
    } catch (err) {
        console.error("AI Service Error:", err);
        return "❌ System logic error in AI service.";
    }
}

module.exports = { mazharAiReply };
