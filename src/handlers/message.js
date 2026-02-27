const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs").promises;
const path = require("path");
const { mazharAiReply } = require("../services/ai");
const { searchImages } = require("../services/image");

const OWNER_JID = process.env.OWNER_JID;
const FILE_BASE_DIR = path.join(__dirname, "../../user_files");
const userStats = {};
const userMediaStats = {};
const userPresences = {};

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
}

const OWNER_IMAGES = [
    'src/assets/owner/owner1.jpg',
    'src/assets/owner/owner2.jpeg',
    'src/assets/owner/owner3.jpeg'
];

// Helper to safely send messages without crashing the terminal if connection drops
async function safeSendMessage(sock, jid, content, options = {}) {
    let retries = 3;
    while (retries > 0) {
        try {
            // Send directly and let Baileys handle the queue/state internally
            return await sock.sendMessage(jid, content, options);
        } catch (err) {
            const isClosed = err.message.includes("Connection Closed") || err.output?.statusCode === 428;
            if (isClosed) {
                console.warn(`⏳ [SYSTEM] Connection unstable. Retrying in 2s (Attempts left: ${retries - 1})...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                retries--;
                continue;
            }
            console.error("❌ [SYSTEM] SafeSend Error:", err.message);
            return;
        }
    }
    console.error("❌ [SYSTEM] Failed to send message after all retries.");
}

function sanitizeFileName(name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
        return null;
    }
    return trimmed;
}

function buildMainMenu() {
    return [
        "💎 *Mazhar DevX Elite v2.0*",
        "────────────────────",
        "🤖 *Mazhar AI (Conversation Memory Enabled)*",
        "   • Just type: *mazhar <your question>*",
        "   • *elite ai* – personality check",
        "",
        "📂 *File Sandbox*",
        "   • *fs help* – manage your files",
        "   • *fs list* – see your sandbox",
        "",
        "🎵 *Entertainment*",
        "   • *song <name>* / *video <name>*",
        "   • *image <query>* – web search",
        "",
        "📊 *System & Stats*",
        "   • *status* – see online users",
        "   • *stats* – your chat history",
        "   • *gallery* – see media stats",
        "   • *health* – system performance",
        "",
        "💡 *Fun & Info*",
        "   • *joke* / *quote* / *time*",
        "   • */premium* – about Mazhar.DevX",
        "",
        "👑 *Owner*: mazhar.devx",
        "────────────────────",
        "Type *menu* to see this list again."
    ].join("\n");
}

async function handleMessage(sock, msg) {
    try {
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || "User";
        const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const text = rawText.trim();
        const lower = text.toLowerCase();

        // Basic stats
        if (!userStats[sender]) userStats[sender] = { messages: 0, firstSeen: new Date() };
        userStats[sender].messages++;

        // Track simple media stats per user
        if (!userMediaStats[sender]) {
            userMediaStats[sender] = { images: 0, videos: 0, lastUpdated: null };
        }
        const mediaStats = userMediaStats[sender];

        // Auto-Download Media
        const messageType = Object.keys(msg.message)[0];
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
        if (mediaTypes.includes(messageType)) {
            if (messageType === 'imageMessage') mediaStats.images++;
            if (messageType === 'videoMessage') mediaStats.videos++;
            mediaStats.lastUpdated = new Date();

            try {
                console.log(`📥 [SYSTEM] Downloading ${messageType} from ${sender}...`);
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                const extension = messageType === 'audioMessage' ? 'mp3' :
                    messageType === 'videoMessage' ? 'mp4' :
                        messageType === 'imageMessage' ? 'jpg' : 'bin';
                const filename = `mazhar_download_${Date.now()}.${extension}`;
                const savePath = path.join(FILE_BASE_DIR, filename);
                await fs.writeFile(savePath, buffer);
                console.log(`✅ [SYSTEM] Saved to: ${filename}`);
            } catch (err) {
                console.error("❌ [SYSTEM] Auto-download error:", err.message);
            }
        }

        // Command Routing
        if (lower === "menu" || lower === "help" || lower === "/menu") {
            await safeSendMessage(sock, sender, { text: buildMainMenu() }, { quoted: msg });
            return;
        }

        if (lower === "health") {
            const uptime = process.uptime();
            const mem = process.memoryUsage().rss / 1024 / 1024;
            await safeSendMessage(sock, sender, {
                text: `🚀 *System Health*\n\n⏱️ Uptime: ${Math.floor(uptime)}s\n📦 Memory: ${mem.toFixed(2)} MB\n✅ Status: Operational`
            }, { quoted: msg });
            return;
        }

        if (lower === "time") {
            await safeSendMessage(sock, sender, { text: `⏰ *Current Server Time*\n\n${new Date().toLocaleString()}` }, { quoted: msg });
            return;
        }

        if (lower === "joke") {
            const jokes = [
                "Why do programmers prefer dark mode? Because light attracts bugs. 😂",
                "Hardware: The parts of a computer that can be kicked. 💻",
                "A SQL query walks into a bar, walks up to two tables, and asks, 'Can I join you?'",
                "Algorithm: Words used by programmers when they don't want to explain what they did."
            ];
            const joke = jokes[Math.floor(Math.random() * jokes.length)];
            await safeSendMessage(sock, sender, { text: `😂 *Dev Joke*\n\n${joke}` }, { quoted: msg });
            return;
        }

        if (lower === "quote") {
            const quotes = [
                "\"First, solve the problem. Then, write the code.\" – John Johnson",
                "\"Experience is the name everyone gives to their mistakes.\" – Oscar Wilde",
                "\"Knowledge is power.\" – Francis Bacon",
                "\"Code is like humor. When you have to explain it, it’s bad.\" – Cory House"
            ];
            const quote = quotes[Math.floor(Math.random() * quotes.length)];
            await safeSendMessage(sock, sender, { text: `💡 *Tech Quote*\n\n${quote}` }, { quoted: msg });
            return;
        }

        if (lower === "owner" || lower === "premium" || lower === "/premium" || lower === "about") {
            await safeSendMessage(sock, sender, {
                text: `👋 Hello! I’m Mazhar – Elite Full Stack Developer | MERN Stack Specialist
 
 🌐 *Full Stack Expertise*
 I craft high-performance, scalable, and modern web applications using the MERN stack: MongoDB, Express.js, React.js, Node.js.
 
 🚀 *What I Can Build For You*
 - Modern responsive websites
 - High-performance web applications
 - REST APIs & backend systems
 - Full end-to-end MERN solutions
 
 📬 *Let’s Connect*
 I’m here to help you turn ideas into real-world projects. ✨`
            }, { quoted: msg });
            return;
        }

        if (lower === "stats") {
            const s = userStats[sender];
            if (s) {
                await safeSendMessage(sock, sender, {
                    text: `📈 *Your Stats*\n\n• Messages Sent: *${s.messages}*\n• First Seen: *${s.firstSeen.toLocaleString()}*\n\nPowered by *Mazhar DevX*`
                }, { quoted: msg });
            }
            return;
        }

        if (lower === "gallery") {
            const m = userMediaStats[sender];
            if (m) {
                await safeSendMessage(sock, sender, {
                    text: `🖼️ *Your Gallery Stats*\n\n• Images Sent: *${m.images}*\n• Videos Sent: *${m.videos}*\n• Last Activity: *${m.lastUpdated ? m.lastUpdated.toLocaleString() : 'No media yet'}*`
                }, { quoted: msg });
            }
            return;
        }

        if (lower === "status") {
            const entries = Object.entries(userPresences);
            if (!entries.length) return safeSendMessage(sock, sender, { text: "No presence data yet." }, { quoted: msg });
            const list = entries.map(([jid, d]) => `• ${jid.split('@')[0]}: ${d.status === 'available' ? '🟢 online' : d.status === 'composing' ? '✍️ typing...' : '⚪ offline'}`).join('\n');
            await safeSendMessage(sock, sender, { text: `👥 *Live Status*\n\n${list}` }, { quoted: msg });
            return;
        }

        if (lower.startsWith("fs ")) {
            const args = text.slice(3).trim();
            const [cmd, ...restTokens] = args.split(" ");
            const cmdLower = (cmd || "").toLowerCase();
            const rest = restTokens.join(" ").trim();

            if (cmdLower === "help") {
                await safeSendMessage(sock, sender, {
                    text: "📂 *File System Help*\n\n• `fs list` - List files\n• `fs create <name> | <content>` - Create file\n• `fs append <name> | <content>` - Add to file\n• `fs read <name>` - Read file\n• `fs delete <name>` - Delete file"
                }, { quoted: msg });
                return;
            }

            if (cmdLower === "list") {
                const files = await fs.readdir(FILE_BASE_DIR);
                await safeSendMessage(sock, sender, { text: `📂 *Your Files:*\n${files.join('\n') || 'No files yet.'}` }, { quoted: msg });
                return;
            }

            if (cmdLower === "create") {
                const [name, ...content] = rest.split("|");
                const safeName = sanitizeFileName(name.trim());
                if (!safeName) return safeSendMessage(sock, sender, { text: "❌ Invalid file name." }, { quoted: msg });
                await fs.writeFile(path.join(FILE_BASE_DIR, safeName), content.join("|").trim());
                const s = await fs.stat(path.join(FILE_BASE_DIR, safeName));
                await safeSendMessage(sock, sender, { text: `✅ File *${safeName}* created. (${formatFileSize(s.size)})` }, { quoted: msg });
                return;
            }

            if (cmdLower === "append") {
                const [name, ...content] = rest.split("|");
                const safeName = sanitizeFileName(name.trim());
                if (!safeName) return safeSendMessage(sock, sender, { text: "❌ Invalid file name." }, { quoted: msg });
                try {
                    await fs.appendFile(path.join(FILE_BASE_DIR, safeName), "\n" + content.join("|").trim());
                    const s = await fs.stat(path.join(FILE_BASE_DIR, safeName));
                    await safeSendMessage(sock, sender, { text: `✅ Content added to *${safeName}*. New size: ${formatFileSize(s.size)}` }, { quoted: msg });
                } catch {
                    await safeSendMessage(sock, sender, { text: "❌ File not found. Use `fs create` first." }, { quoted: msg });
                }
                return;
            }

            if (cmdLower === "read") {
                const safeName = sanitizeFileName(rest);
                if (!safeName) return safeSendMessage(sock, sender, { text: "❌ Invalid file name." }, { quoted: msg });
                try {
                    const data = await fs.readFile(path.join(FILE_BASE_DIR, safeName), "utf8");
                    await safeSendMessage(sock, sender, { text: `📄 *${safeName}*:\n\n${data}` }, { quoted: msg });
                } catch {
                    await safeSendMessage(sock, sender, { text: "❌ File not found." }, { quoted: msg });
                }
                return;
            }

            if (cmdLower === "delete") {
                const safeName = sanitizeFileName(rest);
                if (!safeName) return safeSendMessage(sock, sender, { text: "❌ Invalid file name." }, { quoted: msg });
                await fs.unlink(path.join(FILE_BASE_DIR, safeName)).catch(() => { });
                await safeSendMessage(sock, sender, { text: `🗑️ File *${safeName}* deleted.` }, { quoted: msg });
                return;
            }
        }

        if (lower.startsWith("song ") || lower.startsWith("play song ")) {
            const q = lower.startsWith("song ") ? text.slice(5) : text.slice(10);
            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
            await safeSendMessage(sock, sender, { text: `🎵 *Song Search*: ${q}\n\n▶️ Listen here: ${url}` }, { quoted: msg });
            return;
        }

        if (lower.startsWith("video ")) {
            const q = text.slice(6);
            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
            await safeSendMessage(sock, sender, { text: `📺 *Video Search*: ${q}\n\n▶️ Watch here: ${url}` }, { quoted: msg });
            return;
        }

        const wantsMazharAi = lower.startsWith("mazhar ") || lower.startsWith("mazhar.devx") || lower.startsWith("mazhar devx") || lower.startsWith("ai ");
        if (wantsMazharAi) {
            const cleaned = text
                .replace(/^mazhar\.devx/i, "")
                .replace(/^mazhar devx/i, "")
                .replace(/^mazhar\s+/i, "")
                .replace(/^ai\s+/i, "")
                .trim();

            const prompt = cleaned || "Hello Mazhar!";
            await safeSendMessage(sock, sender, { text: "⚡ _Mazhar is thinking..._" }, { quoted: msg });

            let reply = await mazharAiReply(prompt, sender, pushName);

            // Handle Reaction Trigger
            if (reply.includes("[REACTION:")) {
                const reactMatch = reply.match(/\[REACTION:\s*(.*?)\]/);
                if (reactMatch) {
                    const emoji = reactMatch[1].trim();
                    await sock.sendMessage(sender, { react: { text: emoji, key: msg.key } });
                    reply = reply.replace(/\[REACTION:.*?\]/g, "").trim();
                }
            }

            // Handle Owner Image Trigger
            if (reply.includes("[OWNER_IMAGE]")) {
                const randomImg = OWNER_IMAGES[Math.floor(Math.random() * OWNER_IMAGES.length)];
                try {
                    await safeSendMessage(sock, sender, {
                        image: { url: path.join(process.cwd(), randomImg) },
                        caption: "💎 Here is a photo of the owner, *Mazhar Aslam*."
                    }, { quoted: msg });
                    return;
                } catch (err) {
                    console.error("❌ [SYSTEM] Error sending owner image:", err.message);
                    reply = "💎 *Mazhar Aslam* is currently unavailable to show a photo, but you can check his portfolio here: https://mazhar-devx.netlify.app/";
                }
            }

            // Handle Image Search Trigger
            if (lower.includes("image") || lower.includes("pic") || lower.includes("photo") || reply.includes("[IMG_SEARCH:")) {
                const match = reply.match(/\[IMG_SEARCH:\s*(.*?)(?:,\s*(\d+|count))?\]/i);
                if (match) {
                    const query = match[1].trim();
                    let count = parseInt(match[2]);
                    if (isNaN(count)) count = 1; // Default to 1 if "count" or missing

                    reply = reply.replace(/\[IMG_SEARCH:.*?\]/i, "").trim();

                    try {
                        const imageUrls = await searchImages(query, count);
                        if (imageUrls.length > 0) {
                            for (const url of imageUrls) {
                                await safeSendMessage(sock, sender, { image: { url }, caption: `🖼️ Here is your image of *${query}*` }, { quoted: msg });
                            }
                        } else {
                            reply += `\n\n_(System Note: I searched for "${query}" but found no results.)_`;
                        }
                    } catch (err) {
                        console.error("❌ [SYSTEM] Image Search Error:", err.message);
                        reply += "\n\n_(System Note: Error searching for image.)_";
                    }
                }
            }

            // Check if AI requested a fallback
            if (reply.includes("[FALLBACK]")) {
                const ownerStatus = userPresences[OWNER_JID]?.status || "offline";
                const isOwnerOnline = ownerStatus === "available" || ownerStatus === "composing";
                if (!isOwnerOnline) {
                    await safeSendMessage(sock, sender, {
                        text: "sorry i didn't get that. type menu for option the owner is currently offline place wait"
                    }, { quoted: msg });
                }
                return;
            }

            await safeSendMessage(sock, sender, { text: reply }, { quoted: msg });
            return;
        }

        // Default Fallback Logic for unknown messages
        const ownerStatus = userPresences[OWNER_JID]?.status || "offline";
        const isOwnerOnline = ownerStatus === "available" || ownerStatus === "composing";

        if (!isOwnerOnline) {
            await safeSendMessage(sock, sender, {
                text: "sorry i didn't get that. type menu for option the owner is currently offline place wait"
            }, { quoted: msg });
        }
    } catch (err) {
        console.error("🔥 [CRITICAL] Handler Error:", err);
    }
}

// Presence handler (to be imported in main)
function handlePresence(update) {
    const { id, presences } = update;
    if (!userPresences[id]) userPresences[id] = { status: "offline" };
    const presence = presences[id] || presences[Object.keys(presences)[0]];
    if (presence) {
        userPresences[id].status = presence.lastKnownPresence || "offline";
    }
}

module.exports = { handleMessage, handlePresence };
