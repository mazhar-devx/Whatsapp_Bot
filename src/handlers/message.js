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

// Categories for proactive GIFs (mapped to waifu.pics)
const GIF_CATEGORIES = ["smile", "wave", "happy", "dance", "laugh", "hug", "wink", "pat", "bonk", "yeet", "bully", "slap", "kill", "cringe", "cuddle", "cry"];

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

        // --- Extract Quoted Message Context (Replies) ---
        let quotedContext = "";
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;

        if (quotedMsg) {
            const quotedText = quotedMsg.conversation ||
                quotedMsg.extendedTextMessage?.text ||
                quotedMsg.imageMessage?.caption ||
                quotedMsg.videoMessage?.caption ||
                (quotedMsg.imageMessage ? "[An Image]" : "") ||
                (quotedMsg.videoMessage ? "[A Video]" : "") ||
                (quotedMsg.audioMessage ? "[A Voice Note]" : "") ||
                "";
            if (quotedText) {
                quotedContext = `[USER_REPLY_TO: "${quotedText}"] `;
            }
        }

        // Load Services
        const { getProfile, saveProfile } = require("../services/profile");
        const { addLead, getAllLeads } = require("../services/leads");

        // Load Profile
        const profile = await getProfile(sender, pushName);

        // Basic stats
        if (!userStats[sender]) userStats[sender] = { messages: 0, firstSeen: new Date() };
        userStats[sender].messages++;

        // Track simple media stats per user
        if (!userMediaStats[sender]) {
            userMediaStats[sender] = { images: 0, videos: 0, lastUpdated: null };
        }
        const mediaStats = userMediaStats[sender];

        // Auto-Download Media
        const currentMsgType = Object.keys(msg.message)[0];
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
        if (mediaTypes.includes(currentMsgType)) {
            if (currentMsgType === 'imageMessage') mediaStats.images++;
            if (currentMsgType === 'videoMessage') mediaStats.videos++;
            mediaStats.lastUpdated = new Date();

            try {
                console.log(`📥 [SYSTEM v17.0-MESSENGER] Downloading ${currentMsgType} from ${sender}...`);
                const buffer = await downloadMediaMessage(msg, 'buffer', {}).catch(e => {
                    console.warn(`⚠️ [SYSTEM] Media Download Failed: ${e.message}`);
                    return null;
                });

                if (!buffer) throw new Error("Null buffer received");

                const extension = currentMsgType === 'audioMessage' ? 'mp3' :
                    currentMsgType === 'videoMessage' ? 'mp4' :
                        currentMsgType === 'imageMessage' ? 'jpg' : 'bin';
                const filename = `mazhar_download_${Date.now()}.${extension}`;
                const savePath = path.join(FILE_BASE_DIR, filename);
                await fs.writeFile(savePath, buffer);
                console.log(`✅ [SYSTEM] Saved to: ${filename}`);
            } catch (err) {
                console.error("❌ [SYSTEM] Media Handling Error:", err.message);
            }
        }

        // Command Routing
        if (lower === "menu" || lower === "help" || lower === "/menu") {
            await safeSendMessage(sock, sender, { text: buildMainMenu() }, { quoted: msg });
            return;
        }

        // Personality check command
        if (lower === "elite ai") {
            await safeSendMessage(sock, sender, {
                text: "💎 *Mazhar DevX Elite v2.0*\n\nMain Mazhar hoon yaar. AI waghaira ka koi scene nahi hai. Engineering aur business focus hai bas. 🚀"
            }, { quoted: msg });
            return;
        }

        // Owner only: Leads command
        if ((lower === "leads" || lower === "list leads") && sender === OWNER_JID) {
            const allLeads = await getAllLeads();
            if (allLeads.length === 0) {
                await safeSendMessage(sock, sender, { text: "📂 *Leads Directory*\n\nAbhi tak koi leads nahi hain yaar. Kaam pe lag jao! 🚀" }, { quoted: msg });
            } else {
                const leadList = allLeads.map((l, i) => `${i + 1}. *${l.name}*: ${l.project} (${l.jid.split('@')[0]})`).join("\n");
                await safeSendMessage(sock, sender, { text: `📂 *Collected Leads*\n\n${leadList}\n\nTotal: ${allLeads.length} leads found. 🔥` }, { quoted: msg });
            }
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
                text: `👋 Hello! I’m Mazhar – Elite Full Stack Developer | MERN Stack Specialist\n\n🌐 *Full Stack Expertise*\nI craft high-performance, scalable, and modern web applications using the MERN stack: MongoDB, Express.js, React.js, Node.js.\n\n🚀 *What I Can Build For You*\n- Modern responsive websites\n- High-performance web applications\n- REST APIs & backend systems\n- Full end-to-end MERN solutions\n\n📬 *Let’s Connect*\nI’m here to help you turn ideas into real-world projects. ✨`
            }, { quoted: msg });
            return;
        }

        if (lower === "stats") {
            const s = userStats[sender];
            if (s) {
                await safeSendMessage(sock, sender, {
                    text: `📈 *Your Stats*\n\n• Messages Sent: *${s.messages}*\n• First Seen: *${s.firstSeen.toLocaleString()}*\n• Profile: *${profile.relationship}*\n\nPowered by *Mazhar DevX*`
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
            await safeSendMessage(sock, sender, { text: `🎵 *Searching Audio:* ${q}...\n_(Please wait, downloading MP3)_` }, { quoted: msg });
            try {
                const { searchAudio } = require("../services/search");
                const buffer = await searchAudio(q);
                console.log(`📥 [AUDIO] MP3 Downloaded successfully`);

                await safeSendMessage(sock, sender, {
                    audio: buffer,
                    mimetype: 'audio/mpeg'
                }, { quoted: msg });
            } catch (err) {
                console.error("❌ [AUDIO ENGINE Error]:", err.message);
                await safeSendMessage(sock, sender, { text: `❌ Could not download the song right now. Try another query or use video search.` }, { quoted: msg });
            }
            return;
        }

        if (lower.startsWith("video ") || lower.startsWith("play video ")) {
            const q = lower.startsWith("video ") ? text.slice(6) : text.slice(11);
            await safeSendMessage(sock, sender, { text: `🎬 *Searching Video:* ${q}...\n_(Please wait, downloading MP4)_` }, { quoted: msg });
            try {
                const { searchVideo } = require("../services/search");
                const buffer = await searchVideo(q);
                console.log(`📥 [VIDEO] MP4 Downloaded successfully`);

                await safeSendMessage(sock, sender, {
                    video: buffer,
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } catch (err) {
                console.error("❌ [VIDEO ENGINE Error]:", err.message);
                await safeSendMessage(sock, sender, { text: `❌ Could not download the video right now. Try searching via web.` }, { quoted: msg });
            }
            return;
        }

        // --- [NEW] Nuke Command (Ghost Process Fix) ---
        if (lower === "mazhar nuke" && sender === OWNER_JID) {
            await safeSendMessage(sock, sender, { text: "🧨 [SYSTEM] Nuking this process... Goodbye! (Restart with npm run dev)" }, { quoted: msg });
            console.log("🧨 [NUKE] Owner requested process termination.");
            setTimeout(() => process.exit(0), 1000);
            return;
        }

        // Show typing status
        await sock.sendPresenceUpdate('composing', sender);

        // All text messages that aren't commands go to Mazhar AI
        // AI Interaction
        let prompt = quotedContext + (text || "");
        let mediaBuffer = null;
        let mediaType = null;

        const msgType = Object.keys(msg.message)[0];
        const isImage = msgType === 'imageMessage';
        const isVideo = msgType === 'videoMessage';
        const isAudio = msgType === 'audioMessage';
        const isGif = isVideo && msg.message.videoMessage?.gifPlayback;

        if (isImage || isVideo || isGif) {
            const typeLabel = isGif ? "GIF" : (isImage ? "Image" : "Video");
            mediaType = isImage ? 'image' : (isGif ? 'gif' : 'video');

            if (isImage) {
                console.log(`📥 [SYSTEM v17.0-MESSENGER] Buffering ${typeLabel} for Vision API...`);
                mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
            } else {
                console.log(`⏩ [SYSTEM v17.0-MESSENGER] Bypassing Vision API for ${typeLabel}`);
                mediaBuffer = null; // Save memory, dont buffer video for AI
            }

            // If user didn't send text, provide a default context for the media
            if (!text) {
                if (isImage) prompt = "Is photo ko dekho aur react karo.";
                else if (isGif) prompt = "Is GIF ko dekho aur react karo.";
                else prompt = "Is video ko dekho aur iska breakdown do.";
            }
        } else if (isAudio) {
            console.log(`📥 [SYSTEM] Transcribing voice message...`);
            const audioBuffer = await downloadMediaMessage(msg, 'buffer', {});
            const { transcribeVoice } = require("../services/ai");
            const transcription = await transcribeVoice(audioBuffer);
            if (transcription) {
                console.log(`🎙️ [VOICE] Transcribed: ${transcription}`);
                prompt = transcription;
            } else {
                prompt = "Mazhar, maine voice message bheja hai par error aa raha hai.";
            }
        }

        // If message is empty (like a reaction or sticker we don't handle yet)
        if (!prompt && !mediaBuffer) {
            prompt = "Hi Mazhar!";
        }

        let reply = await mazharAiReply(prompt, sender, pushName, mediaBuffer, mediaType);

        // Stop typing status
        await sock.sendPresenceUpdate('paused', sender);

        // --- 🔒 THE ULTIMATE ANTI-ECHO BARRIER ---
        let cleanReply = reply.trim();
        const pLower = prompt.toLowerCase();
        const rLower = cleanReply.toLowerCase();

        // 1. Pre-emptive Strike: If AI repeats the prompt, SHRED it
        if (rLower.includes(pLower) && pLower.length > 5) {
            cleanReply = cleanReply.replace(new RegExp(`${pLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "gi"), "").trim();
            cleanReply = cleanReply.replace(/^[:\-\s\n,]+/, "");
            cleanReply = cleanReply.replace(/^mazhar: /i, "").trim();
        }

        // 2. Identity Shield (Real Chat Force)
        const realChatKeywords = ["real chat", "fake chat", "are you real", "real ho", "fake ho", "not fake"];
        if (realChatKeywords.some(k => pLower.includes(k))) {
            if (rLower.includes("ai") || rLower.includes("bot") || rLower.includes("model")) {
                cleanReply = "Yaar main Mazhar hi hoon, real chat ho rahi hai. AI waghaira ka koi scene nahi hai, elite engineering aur business focus hai bas. 🚀";
            }
        }
        cleanReply = cleanReply.replace(/Mazhar here/gi, "").replace(/Thinking\.\.\./gi, "").replace(/As an AI model/gi, "Yaar").trim();

        // --- 🧠 CONTEXT RECOVERY TRIGGER ---
        if (cleanReply.includes("[GLOBAL_MEMORY_RESET]")) {
            conversationMemory.delete(sender);
            console.log(`♻️ [SYSTEM] Global Memory Reset triggered for ${sender}`);
            cleanReply = cleanReply.replace(/\[GLOBAL_MEMORY_RESET\]/g, "").trim();
        }

        // --- 🎯 MUTUALLY EXCLUSIVE TRIGGERS (Priority Ordering) ---

        // 0. DEEP RESEARCH (The Intelligent Core)
        if (cleanReply.includes("[DEEP_RESEARCH:")) {
            const match = cleanReply.match(/\[DEEP_RESEARCH:\s*(.*?)\]/i);
            if (match) {
                const query = match[1].trim();
                const { performResearch } = require("../services/search");
                console.log(`📡 [RESEARCH] ${query}`);

                const researchResult = await performResearch(query);
                const webReport = researchResult.web.map(r => `- ${r.title}: ${r.url}`).join("\n");
                const researchPrompt = `Translate and explain this info briefly as Mazhar Aslam in a casual, human way. Match the user's language: ${webReport}`;

                const synthesis = await mazharAiReply(researchPrompt, sender, "System_Research");
                await safeSendMessage(sock, sender, { text: synthesis.trim() }, { quoted: msg });

                // --- FIX: Robust Image Fetching ---
                if (researchResult.images.length > 0) {
                    for (const imgUrl of researchResult.images) {
                        try {
                            const imgRes = await fetch(imgUrl);
                            if (imgRes.ok) {
                                const buffer = Buffer.from(await imgRes.arrayBuffer());
                                await safeSendMessage(sock, sender, {
                                    image: buffer,
                                    caption: `🖼️ Research Image\n🔗 Source: ${imgUrl}` // Source Transparency
                                }, { quoted: msg });
                                break; // Stop after successfully sending one valid image
                            }
                        } catch (err) {
                            console.warn("⚠️ [RESEARCH] Skipping broken image URL:", imgUrl);
                        }
                    }
                }

                if (researchResult.video.length > 0) {
                    const topVid = researchResult.video[0];
                    await safeSendMessage(sock, sender, { text: `🎬 *Video Found:* ${topVid.url}` }, { quoted: msg });
                }
                return; // 🛑 EXIT - NO OTHER TRIGGERS ALLOWED
            }
        }

        // 1. OWNER OFFLINE (Verbose)
        if (cleanReply.includes("[TRIGGER_NOTIFY_OWNER_OFFLINE]")) {
            const isMenuRequest = pLower.includes("menu") || pLower.includes("help") || pLower.includes("admin") || pLower.includes("owner");
            if (isMenuRequest) {
                await safeSendMessage(sock, sender, { text: "sorry i didn't get that. type menu for option the owner is currently offline place wait" }, { quoted: msg });
            } else {
                // If AI hallucinated the offline trigger for a non-menu request, just send the text part
                cleanReply = cleanReply.replace(/\[TRIGGER_NOTIFY_OWNER_OFFLINE\]/g, "").trim();
                if (cleanReply) await safeSendMessage(sock, sender, { text: cleanReply }, { quoted: msg });
            }
            return;
        }

        // 2. GIF TRIGGER
        if (cleanReply.includes("[GIF:")) {
            const gifMatch = cleanReply.match(/\[GIF:\s*(.*?)\]/i);
            if (gifMatch) {
                const category = gifMatch[1].trim();
                const { getGif } = require("../services/gif");
                const gifUrl = await getGif(category);

                // --- [FIX v19.0] Send GIF as Image buffer to avoid corrupt MP4 issues on WhatsApp Clients ---
                try {
                    console.log(`📥 [GIF] Buffering media: ${gifUrl}`);
                    const res = await fetch(gifUrl);
                    if (!res.ok) throw new Error("Fetch failed");
                    const arrayBuffer = await res.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    cleanReply = cleanReply.replace(/\[GIF:.*?\]/i, "").trim();
                    await safeSendMessage(sock, sender, {
                        image: buffer, // Sent as image so the client downloads it successfully
                        caption: cleanReply || undefined
                    }, { quoted: msg });
                } catch (err) {
                    console.error("❌ [GIF] Buffer Error:", err.message);
                    // Fallback to text if buffer fails
                    await safeSendMessage(sock, sender, { text: cleanReply.replace(/\[GIF:.*?\]/i, "").trim() }, { quoted: msg });
                }
                return;
            }
        }

        // 3. FORWARD TRIGGER
        if (cleanReply.includes("[FORWARD:")) {
            const match = cleanReply.match(/\[FORWARD:\s*(.*?)\s*\|\s*(.*?)\]/i);
            if (match) {
                let phone = match[1].replace(/[^0-9]/g, "");
                // Convert 03XX... to 923XX... (Pakistani format)
                if (phone.startsWith("03")) {
                    phone = "92" + phone.substring(1);
                }
                const fwdMessage = match[2].trim();
                const targetJid = phone + "@s.whatsapp.net";

                console.log(`🚀 [FORWARD] Dispatching msg to ${targetJid}`);
                await safeSendMessage(sock, targetJid, { text: fwdMessage });

                cleanReply = cleanReply.replace(/\[FORWARD:.*?\]/i, "").trim();
            }
        }

        // 4. OWNER IMAGE TRIGGER (Verbose - Anti-Hallucination)
        if (cleanReply.includes("[TRIGGER_SEND_REAL_OWNER_PHOTO]")) {
            const randomImg = OWNER_IMAGES[Math.floor(Math.random() * OWNER_IMAGES.length)];
            try {
                const buffer = await fs.readFile(path.join(process.cwd(), randomImg));
                await safeSendMessage(sock, sender, {
                    image: buffer,
                    caption: "💎 Here is a photo of the owner, *Mazhar Aslam*."
                }, { quoted: msg });
            } catch (err) {
                console.error("❌ [IMAGE] Buffer Error:", err.message);
            }
            return;
        }

        // 4. SEARCH TRIGGERS (Web/Video)
        if (cleanReply.includes("[WEB_SEARCH:")) {
            const match = cleanReply.match(/\[WEB_SEARCH:\s*(.*?)\]/i);
            if (match) {
                const query = match[1].trim();
                const { deepSearch } = require("../services/search");
                const results = await deepSearch(query, "web");
                cleanReply = cleanReply.replace(/\[WEB_SEARCH:.*?\]/i, "").trim();
                if (results.length > 0) {
                    const links = results.map(r => `• *${r.title}*\n  🔗 ${r.url}`).join("\n\n");
                    cleanReply += `\n\n🌐 *Deep Search Results for "${query}":*\n\n${links}`;
                }
            }
        }

        if (cleanReply.includes("[VID_SEARCH:")) {
            const match = cleanReply.match(/\[VID_SEARCH:\s*(.*?)\]/i);
            if (match) {
                const query = match[1].trim();
                const { deepSearch } = require("../services/search");
                const results = await deepSearch(query, "video");
                cleanReply = cleanReply.replace(/\[VID_SEARCH:.*?\]/i, "").trim();
                if (results.length > 0) {
                    const links = results.map(r => `• *${r.title}*\n  🎬 ${r.url}`).join("\n\n");
                    cleanReply += `\n\n🎬 *Deep Video Search for "${query}":*\n\n${links}`;
                }
            }
        }

        // 5. REACTION TRIGGER
        if (cleanReply.includes("[REACTION:")) {
            const reactMatch = cleanReply.match(/\[REACTION:\s*(.*?)\]/);
            if (reactMatch) {
                await sock.sendMessage(sender, { react: { text: reactMatch[1].trim(), key: msg.key } });
                cleanReply = cleanReply.replace(/\[REACTION:.*?\]/g, "").trim();
            }
        }

        // Handle Lead Trigger
        if (cleanReply.includes("[NEW_LEAD:")) {
            const leadMatch = cleanReply.match(/\[NEW_LEAD:\s*(.*?),\s*(.*?)\]/i);
            if (leadMatch) {
                const leadName = leadMatch[1].trim();
                const project = leadMatch[2].trim();
                const saved = await addLead(sender, leadName, project);
                if (saved) {
                    profile.relationship = "Lead";
                    profile.notes = `Interested in: ${project}`;
                    await saveProfile(sender, profile);
                }
                cleanReply = cleanReply.replace(/\[NEW_LEAD:.*?\]/i, "").trim();
            }
        }

        // Handle Image Search Trigger
        if (cleanReply.includes("[IMG_SEARCH:")) {
            const match = cleanReply.match(/\[IMG_SEARCH:\s*(.*?)(?:,\s*(\d+|count))?\]/i);
            if (match) {
                const query = match[1].trim();
                let count = parseInt(match[2]);
                if (isNaN(count)) count = 1;

                cleanReply = cleanReply.replace(/\[IMG_SEARCH:.*?\]/i, "").trim();

                try {
                    const { searchWebImages } = require("../services/search");
                    // Fetch more images than requested so we have backups if some fail
                    const imageUrls = await searchWebImages(query, count + 3);

                    if (imageUrls.length > 0) {
                        let successCount = 0;
                        for (const url of imageUrls) {
                            if (successCount >= count) break;
                            try {
                                const imgRes = await fetch(url);
                                if (imgRes.ok) {
                                    const buffer = Buffer.from(await imgRes.arrayBuffer());
                                    await safeSendMessage(sock, sender, {
                                        image: buffer,
                                        caption: `🖼️ Found from Web\n🔗 Source (Clickable): ${url}` // Source Transparency
                                    }, { quoted: msg });
                                    successCount++;
                                }
                            } catch (err) {
                                console.warn("⚠️ [SEARCH] Skipping broken image URL:", url);
                            }
                        }
                        if (successCount === 0) {
                            cleanReply += `\n\n_(System Note: Tried to send images for "${query}", but all links were broken.)_`;
                        }
                    } else {
                        cleanReply += `\n\n_(System Note: I searched for "${query}" on the web but found no results.)_`;
                    }
                } catch (err) {
                    console.error("❌ [SYSTEM] Image Search Error:", err.message);
                    cleanReply += "\n\n_(System Note: Error searching for image.)_";
                }
            }
        }

        // 6. SONG SEARCH TRIGGER (The DJ)
        if (cleanReply.includes("[SONG_SEARCH:")) {
            const match = cleanReply.match(/\[SONG_SEARCH:\s*(.*?)\]/i);
            if (match) {
                const query = match[1].trim();
                cleanReply = cleanReply.replace(/\[SONG_SEARCH:.*?\]/i, "").trim();

                try {
                    const { searchAudio } = require("../services/search");
                    const buffer = await searchAudio(query);
                    console.log(`📥 [AI DJ] Sent MP3 for: ${query}`);

                    await safeSendMessage(sock, sender, {
                        audio: buffer,
                        mimetype: 'audio/mpeg'
                    }, { quoted: msg });
                    cleanReply += `\n\n🎵 _Sent audio for: ${query}_`;
                } catch (err) {
                    console.error("❌ [AI DJ Error]:", err.message);
                    cleanReply += `\n\n_(System Note: Sorry yaar, the audio download for "${query}" failed right now.)_`;
                }
            }
        }

        // 7. VIDEO SEARCH TRIGGER (The Cinema)
        if (cleanReply.includes("[VIDEO_DOWNLOAD:")) {
            const match = cleanReply.match(/\[VIDEO_DOWNLOAD:\s*(.*?)\]/i);
            if (match) {
                const query = match[1].trim();
                cleanReply = cleanReply.replace(/\[VIDEO_DOWNLOAD:.*?\]/i, "").trim();

                try {
                    const { searchVideo } = require("../services/search");
                    const buffer = await searchVideo(query);
                    console.log(`📥 [AI CINEMA] Sent MP4 for: ${query}`);

                    await safeSendMessage(sock, sender, {
                        video: buffer,
                        mimetype: 'video/mp4'
                    }, { quoted: msg });
                    cleanReply += `\n\n🎬 _Sent video for: ${query}_`;
                } catch (err) {
                    console.error("❌ [AI CINEMA Error]:", err.message);
                    cleanReply += `\n\n_(System Note: Sorry yaar, the video download for "${query}" failed right now.)_`;
                }
            }
        }

        // 8. FINAL TEXT REPLY
        if (cleanReply.trim()) {
            await safeSendMessage(sock, sender, { text: cleanReply }, { quoted: msg });
        }
        return;

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
