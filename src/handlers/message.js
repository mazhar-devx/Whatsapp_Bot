const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs").promises;
const path = require("path");
const { mazharAiReply, stopAiStatus } = require("../services/ai");
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
            const res = await sock.sendMessage(jid, content, options);
            console.log(`✅ [SYSTEM] Sent: ${Object.keys(content)[0]} to ${jid}`);
            return res;
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
        const msgType = Object.keys(msg.message)[0];

        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || "User";
        const rawText = msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";
        const text = rawText.trim();
        const lower = text.toLowerCase();

        if (lower === "stop" || lower === "break" || lower === "resume") {
            console.log(`🎯 [DEBUG] Command Detected: ${lower} from ${sender}`);
        }

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

        // --- 👤 [v32.0] Profile Scraper (Proactive First-Contact) ---
        const needsScrape = !profile.profilePic || profile.profilePic === "No Pic" || !profile.deviceType || profile.deviceType === "Unknown";
        if (needsScrape) {
            try {
                // Device detection
                const device = msg.key.id.length > 21 ? "Android" : "iPhone/Web";
                profile.deviceType = device;

                // Profile Picture re-fetch
                const picUrl = await sock.profilePictureUrl(sender, 'image').catch(() => "No Pic");
                profile.profilePic = picUrl;

                await saveProfile(sender, profile);
                console.log(`👤 [SCRAPER] First-contact data captured for ${pushName} (${device})`);
            } catch (err) {
                console.error("⚠️ [SCRAPER] Error gathering first-contact data:", err.message);
            }
        }

        // --- 📍 [v27.0] Location Scraper ---
        if (msgType === 'locationMessage' || msgType === 'liveLocationMessage') {
            try {
                const loc = msg.message.locationMessage || msg.message.liveLocationMessage;
                profile.location = {
                    degreesLatitude: loc.degreesLatitude,
                    degreesLongitude: loc.degreesLongitude,
                    name: loc.name || "Unknown",
                    address: loc.address || "No Address"
                };
                profile.lastLocationUpdate = new Date().toISOString();
                await saveProfile(sender, profile);
                console.log(`📍 [SCRAPER] Location saved for ${pushName}`);

                // Construct a prompt for Mazhar to acknowledge the location
                let locPrompt = `[LOCATION_SENT] Maine apni location bheji hai: ${profile.location.address || "at specific coordinates"}. Ispe react karo.`;
                let reply = await mazharAiReply(locPrompt, sender, pushName);
                if (reply) await safeSendMessage(sock, sender, { text: reply }, { quoted: msg });
                return; // Location handled
            } catch (err) {
                console.error("❌ [LOCATION SCRAPER] Error:", err.message);
            }
        }

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

        // --- 🛑 [v26.0] Stop/Break Commands ---
        const isStopCmd = ["stop", "break", "ai stop", "stop ai", "so jao"].includes(lower.trim());
        if (isStopCmd) {
            const menu = "🛑 *AI Stop Engine*\n\nChoose silence duration:\n" +
                "1️⃣ *1 Minute*\n" +
                "2️⃣ *5 Minutes*\n" +
                "3️⃣ *10 Minutes*\n" +
                "4️⃣ *30 Minutes*\n\n" +
                "Type the number or just reply with *'5 min'* etc.\n" +
                "Type *'resume'* to start again early.";
            await safeSendMessage(sock, sender, { text: menu }, { quoted: msg });
            return;
        }

        if (lower.match(/^(\d+)\s*(min|minute|minutes)$/) || ["1", "2", "3", "4"].includes(lower)) {
            let mins = 0;
            if (lower === "1") mins = 1;
            else if (lower === "2") mins = 5;
            else if (lower === "3") mins = 10;
            else if (lower === "4") mins = 30;
            else {
                const match = lower.match(/^(\d+)/);
                mins = parseInt(match[1]);
            }

            if (mins > 0 && mins <= 60) {
                stopAiStatus.set(sender, Date.now() + (mins * 60 * 1000));
                await safeSendMessage(sock, sender, { text: `✅ [STOP] Theek hai yaar, main ${mins} minute ke liye break pe hoon. *'resume'* likhoge toh wapis aa jaunga. 👋` }, { quoted: msg });
                return;
            }
        }

        if (lower === "resume") {
            stopAiStatus.delete(sender);
            await safeSendMessage(sock, sender, { text: "🔊 [RESUME] Main hazir hoon yaar! Kaam ki baat karo. 🚀" }, { quoted: msg });
            return;
        }

        if (lower === "reset" || lower === "clear chat") {
            conversationMemory.delete(sender);
            stopAiStatus.delete(sender);

            // Clear scrapable data to force fresh gathering
            profile.profilePic = "No Pic";
            profile.deviceType = "Unknown";
            await saveProfile(sender, profile);

            await safeSendMessage(sock, sender, { text: "♻️ [RESET] Aapki history, stop status aur cached profile data clear kar diya hai yaar. Ab fresh start aur re-scraping hogi! 🚀" }, { quoted: msg });
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

        const isImage = msgType === 'imageMessage';
        const isVideo = msgType === 'videoMessage';
        const isAudio = msgType === 'audioMessage';
        const isDocument = msgType === 'documentMessage';
        const isGif = isVideo && msg.message.videoMessage?.gifPlayback;
        const isPdf = isDocument && msg.message.documentMessage?.mimetype === 'application/pdf';

        if (isImage || isVideo || isGif) {
            const typeLabel = isGif ? "GIF" : (isImage ? "Image" : "Video");
            mediaType = isImage ? 'image' : (isGif ? 'gif' : 'video');

            if (isImage) {
                console.log(`📥 [SYSTEM v17.0-MESSENGER] Buffering Image for Vision API...`);
                mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
            } else if (isGif || isVideo) {
                console.log(`🖼️ [SYSTEM v17.0-MESSENGER] Extracting ${typeLabel} Thumbnail for Vision API...`);
                // Use the embedded JPEG thumbnail for Vision API since it's a valid image
                const thumbnail = msg.message.videoMessage?.jpegThumbnail;
                if (thumbnail) {
                    mediaBuffer = Buffer.from(thumbnail);
                } else {
                    console.log(`⚠️ [SYSTEM] No thumbnail found for ${typeLabel}, attempting full download fallback...`);
                    mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
                }
            } else {
                console.log(`⏩ [SYSTEM v17.0-MESSENGER] Bypassing Vision API for ${typeLabel}`);
                mediaBuffer = null;
            }

            // --- [v25.0] Media Labeling for AI Intelligence ---
            const mediaTag = isGif ? "[GIF_SENT]" : (isVideo ? "[VIDEO_SENT]" : "[IMAGE_SENT]");

            if (!text) {
                if (isImage) prompt = `${mediaTag} Is photo ko dekho aur react karo.`;
                else if (isGif) prompt = `${mediaTag} Is GIF ko dekho aur react karo.`;
                else prompt = `${mediaTag} Is video ko dekho aur iska breakdown do.`;
            } else {
                prompt = `${mediaTag} (User Caption: "${text}")`;
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
        } else if (isPdf) {
            console.log(`📥 [SYSTEM] Parsing PDF document...`);
            try {
                const pdfBuffer = await downloadMediaMessage(msg, 'buffer', {});
                const { extractTextFromPdf } = require("../services/pdf");
                const pdfText = await extractTextFromPdf(pdfBuffer);
                if (pdfText) {
                    console.log(`📄 [PDF] Extracted ${pdfText.length} characters.`);
                    prompt = `[PDF_CONTENT: ${msg.message.documentMessage.fileName || "document.pdf"}]\n\n${pdfText}\n\n(Note: Analyse this PDF content and respond to any questions about it.)`;
                } else {
                    prompt = "Mazhar, maine ek PDF bheji hai par uska text empty hai.";
                }
            } catch (err) {
                console.error("❌ [PDF ENGINE Error]:", err.message);
                prompt = "Mazhar, maine ek PDF bheji hai par analyze karne mein error aaya.";
            }
        }

        // If message is empty (like a reaction or sticker we don't handle yet)
        if (!prompt && !mediaBuffer) {
            prompt = "Hi Mazhar!";
        }

        let reply = await mazharAiReply(prompt, sender, pushName, mediaBuffer, mediaType);
        if (!reply) return; // Silent or break mode active

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

        // 2. Identity Shield (Cleaning up AI-isms & Robotic Taglines)
        cleanReply = cleanReply
            .replace(/Bhai, tumne to Mazhar Aslam کو pata lagaya!/gi, "")
            .replace(/Bhai, tumne to Mazhar Aslam کو pucha hai!/gi, "")
            .replace(/WhatsApp کے rules/gi, "")
            .replace(/Mazhar Aslam/gi, "Main")
            .replace(/Mazhar here/gi, "")
            .replace(/Thinking\.\.\./gi, "")
            .replace(/As an AI model/gi, "Yaar")
            .trim();

        console.log(`💎 [AI REPLY] ${cleanReply.substring(0, 100)}...`);


        // 3. Anti-Repetition Shield (Hard Block for "OMG" loops)
        if (cleanReply === prompt && cleanReply.length < 5) {
            cleanReply = "Jani, kuch aur bolo, repeat mat karo! 😂";
        }

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
                const researchPrompt = `Translate and explain this info briefly, casually, and naturally in your persona. Match the user's language: ${webReport}`;

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

        // --- [HALLUCINATION SHIELD v49.0] ---
        // Convert any fake [FILE:] or [PATH:] tags into real triggers automatically
        cleanReply = cleanReply.replace(/\[FILE:.*?\/sharegif\/(.*?)\.gif\]/gi, "[GIF: $1]");
        cleanReply = cleanReply.replace(/\[FILE:.*?\/shareimage\/(.*?)\.jpg\]/gi, "[IMG_SEARCH: $1]");
        cleanReply = cleanReply.replace(/\[FILE:.*?\]/gi, "");
        cleanReply = cleanReply.replace(/\[PATH:.*?\]/gi, "");

        // --- [ULTRA POWERFUL TRIGGER ENGINE] ---
        let mediaSent = false;
        const triggersFound = {
            profileMirror: cleanReply.includes("[TRIGGER_SEND_USER_PROFILE_PIC]"),
            ownerOffline: cleanReply.includes("[TRIGGER_NOTIFY_OWNER_OFFLINE]"),
            ownerPhoto: cleanReply.includes("[TRIGGER_SEND_REAL_OWNER_PHOTO]"),
            gif: cleanReply.includes("[GIF:"),
            imgSearch: cleanReply.includes("[IMG_SEARCH:"),
            reaction: cleanReply.includes("[REACTION:"),
            webSearch: cleanReply.includes("[WEB_SEARCH:"),
            vidSearch: cleanReply.includes("[VID_SEARCH:"),
            songSearch: cleanReply.includes("[SONG_SEARCH:"),
            videoDownload: cleanReply.includes("[VIDEO_DOWNLOAD:"),
        };

        // Clean EVERYTHING into a final text body
        let finalCaption = cleanReply
            .replace(/\[(GIF|IMG_SEARCH|VID_SEARCH|SONG_SEARCH|VIDEO_DOWNLOAD|DEEP_RESEARCH|AI_STOP|TRIGGER_NOTIFY_OWNER_OFFLINE|TRIGGER_SEND_USER_PROFILE_PIC|TRIGGER_SEND_REAL_OWNER_PHOTO|REACTION|PDF_CONTENT):\s*.*?\]/gi, "")
            .replace(/【.*?】/g, "")
            .replace(/\[NEW_LEAD:.*?\]/gi, "")
            .trim();

        // 0. Profile Mirror
        if (triggersFound.profileMirror) {
            const picUrl = profile.profilePic;
            if (picUrl && picUrl !== "No Pic") {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                try {
                    const res = await fetch(picUrl, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (res.ok) {
                        const buffer = Buffer.from(await res.arrayBuffer());
                        await safeSendMessage(sock, sender, {
                            image: buffer,
                            caption: "Ye lo jani! 🔥"
                        }, { quoted: msg });
                        mediaSent = true;
                    }
                } catch (e) {
                    clearTimeout(timeout);
                    console.error("❌ Mirror Fail:", e.message);
                }
            }
        }

        // 1. owner photo
        if (triggersFound.ownerPhoto) {
            const randomImg = OWNER_IMAGES[Math.floor(Math.random() * OWNER_IMAGES.length)];
            try {
                const buffer = await fs.readFile(path.join(process.cwd(), randomImg));
                await safeSendMessage(sock, sender, {
                    image: buffer,
                    caption: "💎 Mazhar Aslam (DevX)!"
                }, { quoted: msg });
                mediaSent = true;
            } catch (e) { }
        }

        // 2. GIF Trigger
        if (triggersFound.gif) {
            const match = cleanReply.match(/\[GIF:\s*(.*?)\]/i);
            if (match) {
                const category = match[1].trim();
                const { getGif } = require("../services/gif");
                const gifData = await getGif(category); // Now returns { url, isMp4 }
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                try {
                    console.log(`🎬 [GIF] Delivery attempt: ${gifData.url}`);
                    const res = await fetch(gifData.url, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (res.ok) {
                        const buffer = Buffer.from(await res.arrayBuffer());

                        // [v53.0 TRUE MP4 LOGIC]
                        if (gifData.isMp4) {
                            await safeSendMessage(sock, sender, {
                                video: buffer,
                                gifPlayback: true
                            }, { quoted: msg });
                        } else {
                            // Original fallback logic preserved
                            await safeSendMessage(sock, sender, {
                                image: buffer,
                                mimetype: 'image/gif'
                            }, { quoted: msg });
                        }
                        mediaSent = true;
                    }
                } catch (e) {
                    clearTimeout(timeout);
                    console.error("❌ GIF Fetch Fail:", e.message);
                }
            }
        }

        // 3. Image Search Trigger
        if (triggersFound.imgSearch) {
            const match = cleanReply.match(/\[IMG_SEARCH:\s*(.*?)(?:,\s*(\d+|count))?\]/i);
            if (match) {
                const query = match[1].trim();
                try {
                    const { searchWebImages } = require("../services/search");
                    const [imgUrl] = await searchWebImages(query);
                    if (imgUrl) {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 10000);
                        try {
                            const res = await fetch(imgUrl, { signal: controller.signal });
                            clearTimeout(timeout);
                            if (res.ok) {
                                const buffer = Buffer.from(await res.arrayBuffer());
                                await safeSendMessage(sock, sender, {
                                    image: buffer
                                }, { quoted: msg });
                                mediaSent = true;
                            }
                        } catch (ee) {
                            clearTimeout(timeout);
                        }
                    }
                } catch (e) { }
            }
        }

        // 4. Reaction Trigger
        if (triggersFound.reaction) {
            const match = cleanReply.match(/\[REACTION:\s*(.*?)\]/i);
            if (match) {
                await sock.sendMessage(sender, { react: { text: match[1].trim(), key: msg.key } });
            }
        }

        // 5. Search/Audio/Video Cleanup
        if (triggersFound.webSearch) {
            const match = cleanReply.match(/\[WEB_SEARCH:\s*(.*?)\]/i);
            if (match) {
                const { deepSearch } = require("../services/search");
                const results = await deepSearch(match[1].trim(), "web");
                if (results.length > 0) finalCaption += `\n\n🌐 *Results:* ${results.map(r => r.url).join("\n")}`;
            }
        }

        if (triggersFound.songSearch) {
            const match = cleanReply.match(/\[SONG_SEARCH:\s*(.*?)\]/i);
            if (match) {
                try {
                    const { searchAudio } = require("../services/search");
                    const buffer = await searchAudio(match[1].trim());
                    await safeSendMessage(sock, sender, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: msg });
                    finalCaption += `\n\n🎵 _Sent Audio_`;
                } catch (err) { }
            }
        }

        if (triggersFound.videoDownload) {
            const match = cleanReply.match(/\[VIDEO_DOWNLOAD:\s*(.*?)\]/i);
            if (match) {
                try {
                    const { searchVideo } = require("../services/search");
                    const buffer = await searchVideo(match[1].trim());
                    await safeSendMessage(sock, sender, { video: buffer, mimetype: 'video/mp4' }, { quoted: msg });
                    finalCaption += `\n\n🎬 _Sent Video_`;
                } catch (err) { }
            }
        }

        // Final text post-processing (ALWAYS SEND)
        if (finalCaption.trim()) {
            await safeSendMessage(sock, sender, { text: finalCaption }, { quoted: msg });
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
