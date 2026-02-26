const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const fs = require("fs").promises;
const path = require("path");
const Pino = require("pino");
const qrcode = require("qrcode-terminal");

const OWNER_NAME = "mazhar.devx";
const FILE_BASE_DIR = path.join(__dirname, "user_files");
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "messages.txt");
const userMediaStats = {};
const userStats = {};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function sanitizeFileName(name) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return null;
  }
  return trimmed;
}

function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function formatTimestamp(date) {
  return date.toISOString();
}

async function appendLogLine(line) {
  try {
    await fs.appendFile(LOG_FILE, line + "\n", "utf8");
  } catch {
    // ignore logging errors to avoid breaking bot flow
  }
}

async function logMessage(direction, sender, contentSummary) {
  const ts = formatTimestamp(new Date());
  const safeContent =
    typeof contentSummary === "string"
      ? contentSummary.replace(/\s+/g, " ").slice(0, 500)
      : JSON.stringify(contentSummary);
  const line = `[${ts}] [${direction}] [${sender}] ${safeContent}`;
  await appendLogLine(line);
}

function buildMainMenu() {
  return [
    "📜 *Mazhar DevX Main Menu*",
    `👑 Bot owner: *${OWNER_NAME}*`,
    "",
    "1️⃣ *File System*",
    "   _Manage simple files in my sandbox_",
    "   • `fs help` – show file commands",
    "",
    "2️⃣ *Songs*",
    "   _Search and play songs via YouTube_",
    "   • `song despacito`",
    "   • `play song love story`",
    "",
    "3️⃣ *Videos*",
    "   _Find videos to watch_",
    "   • `video programming tutorial`",
    "",
    "4️⃣ *Talk with Mazhar.DevX*",
    "   _Chat like with a human dev_",
    "   • `mazhar.devx how are you?`",
    "   • `mazhar devx help me with coding`",
    "",
    "5️⃣ *Gallery*",
    "   _Overview of images & videos you sent to this bot_",
    "   • `gallery` – see your media stats",
    "   • `gallery help` – how it works",
    "",
    "6️⃣ *User Stats & Tools*",
    "   • `stats` – see your usage stats",
    "   • `time` – current server time",
    "   • `joke` / `quote` – fun replies",
    "",
    "7️⃣ *About / Premium*",
    "   • `/premium` – info about Mazhar & the bot owner",
    "",
    "You can type `menu` or `/menu` anytime to see this again."
  ].join("\n");
}

async function startBot() {
  console.log("⏳ Starting WhatsApp Bot...");

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  await fs.mkdir(FILE_BASE_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(LOG_DIR, { recursive: true }).catch(() => {});

  const sock = makeWASocket({
    version,
    auth: state,
    logger: Pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.04"]
  });

  const baseSendMessage = sock.sendMessage.bind(sock);
  sock.sendLoggedMessage = async (jid, content, options) => {
    const preview =
      content?.text ||
      content?.caption ||
      (content ? JSON.stringify(Object.keys(content)) : "<empty>");
    await logMessage("OUT", jid, preview);
    return baseSendMessage(jid, content, options);
  };

  sock.ev.on("creds.update", saveCreds);

  // ✅ Connection & QR handling
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan this QR code with your WhatsApp app:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Bot Connected Successfully!");
    }

    if (connection === "close") {
      console.log("Full disconnect error:", lastDisconnect?.error);
      const statusCode =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.statusCode;
      console.log("❌ Connection closed. Reason:", statusCode);

      if (statusCode !== DisconnectReason.loggedOut) {
        startBot();
      }
    }
  });

  // ✅ Message handler with menus
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const m = msg.message;
    const statsKey = msg.key.remoteJid;

    // Per-user general stats
    if (!userStats[statsKey]) {
      userStats[statsKey] = {
        messages: 0,
        firstSeen: new Date(),
        lastSeen: new Date()
      };
    } else {
      userStats[statsKey].lastSeen = new Date();
    }
    userStats[statsKey].messages += 1;

    // Track simple media stats per user (images/videos sent to this bot)
    if (!userMediaStats[statsKey]) {
      userMediaStats[statsKey] = { images: 0, videos: 0, lastUpdated: null };
    }
    const mediaStats = userMediaStats[statsKey];

    if (m.imageMessage) {
      mediaStats.images += 1;
      mediaStats.lastUpdated = new Date();
    } else if (m.videoMessage) {
      mediaStats.videos += 1;
      mediaStats.lastUpdated = new Date();
    }

    const rawText =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const text = rawText.trim();
    const lower = text.toLowerCase();
    const sender = msg.key.remoteJid;

    console.log("📩 Message received:", text);

    const inSummary =
      text ||
      (m.imageMessage
        ? "<image message>"
        : m.videoMessage
        ? "<video message>"
        : "<non-text message>");
    await logMessage("IN", sender, inSummary);

    // Global simple utilities / advanced feel
    if (lower === "owner" || lower === "/owner") {
      await sock.sendLoggedMessage(sender, {
        text:
          `👑 *Bot Owner*: ${OWNER_NAME}\n` +
          "This WhatsApp assistant is crafted and owned by Mazhar.DevX.\n" +
          "Respect the creator and enjoy the advanced features."
      });
      return;
    }

    if (lower === "stats" || lower === "/stats") {
      const s = userStats[statsKey] || {
        messages: 0,
        firstSeen: null,
        lastSeen: null
      };
      await sock.sendLoggedMessage(sender, {
        text:
          "📈 *Your Chat Stats (Mazhar DevX Bot)*\n\n" +
          `• Messages you sent here: *${s.messages}*\n` +
          `• First seen: *${s.firstSeen ? s.firstSeen.toLocaleString() : "just now"}*\n` +
          `• Last seen: *${s.lastSeen ? s.lastSeen.toLocaleString() : "just now"}*\n\n` +
          `Powered by *${OWNER_NAME}*`
      });
      return;
    }

    if (lower === "time" || lower === "/time") {
      const now = new Date();
      await sock.sendLoggedMessage(sender, {
        text:
          "⏰ *Current Server Time*\n\n" +
          now.toLocaleString() +
          `\n\nBot by *${OWNER_NAME}*`
      });
      return;
    }

    if (lower === "joke" || lower === "/joke") {
      await sock.sendLoggedMessage(sender, {
        text:
          "😂 *Dev Joke from Mazhar.DevX*\n\n" +
          "Why do programmers prefer dark mode?\n" +
          "Because light attracts bugs."
      });
      return;
    }

    if (lower === "quote" || lower === "/quote") {
      await sock.sendLoggedMessage(sender, {
        text:
          "💡 *Tech Quote*\n\n" +
          "\"First, solve the problem. Then, write the code.\" – John Johnson\n\n" +
          `Shared by *${OWNER_NAME}*`
      });
      return;
    }

    // Main menu
    if (lower === "menu" || lower === "/menu" || lower === "help") {
      await sock.sendLoggedMessage(sender, { text: buildMainMenu() });
      return;
    }

    // About / premium info
    if (
      text === "/premium" ||
      lower === "/hello" ||
      lower === "hello" ||
      lower === "/hi" ||
      lower === "hi" ||
      lower === "/info" ||
      lower === "info" ||
      lower === "/about" ||
      lower === "about" ||
      lower === "/mazhar" ||
      lower === "mazhar"
    ) {
      await sock.sendLoggedMessage(sender, {
        text: `👋 Hello! I’m Mazhar – Elite Full Stack Developer | MERN Stack Specialist

🌐 *Full Stack Expertise*
I craft high-performance, scalable, and modern web applications using the MERN stack: MongoDB, Express.js, React.js, Node.js. I specialize in building robust backend systems, dynamic frontends, and end-to-end solutions tailored for business growth and user experience excellence.

💻 *Languages & Technologies*
- Frontend: React.js, Redux, Next.js, HTML5, CSS3, SASS, TailwindCSS
- Backend: Node.js, Express.js, RESTful APIs, GraphQL
- Database: MongoDB, Mongoose, Aggregation Pipelines
- Tools & DevOps: Git, GitHub, Version Control, Docker basics
- Deployment & Hosting: Netlify, Vercel, Heroku, AWS basics
- Programming: JavaScript (ES6+), TypeScript

🚀 *What I Can Build For You*
- Modern responsive websites with dynamic UI/UX
- High-performance web applications
- REST APIs & backend systems with database integration
- Full end-to-end MERN solutions
- Optimized, scalable & maintainable projects

💡 *Why Work With Me*
I don’t just code; I engineer solutions. My work combines innovation, clean architecture and advanced development techniques to deliver projects that are fast, secure and future-proof.

📬 *Let’s Connect*
I’m here to help you turn ideas into real-world digital solutions. How can I assist you today? ✨`
      });
      return;
    }

    // 5️⃣ Gallery (media overview for this chat)
    if (lower === "gallery" || lower === "/gallery" || lower.startsWith("gallery ")) {
      const stats = userMediaStats[sender] || {
        images: 0,
        videos: 0,
        lastUpdated: null
      };

      if (lower.includes("help")) {
        await sock.sendLoggedMessage(sender, {
          text:
            "🖼️ *Gallery Help*\n\n" +
            "- This bot cannot read your private phone/computer gallery.\n" +
            "- It only tracks images and videos that *you send to this chat*.\n\n" +
            "Commands:\n" +
            "• `gallery` – show how many images & videos you have sent here\n" +
            "• Send new images/videos to this chat to grow your gallery\n\n" +
            `Bot owner: *${OWNER_NAME}*`
        });
        return;
      }

      const lastText = stats.lastUpdated
        ? stats.lastUpdated.toLocaleString()
        : "no media yet";

      await sock.sendLoggedMessage(sender, {
        text:
          "🖼️ *Your Chat Gallery*\n\n" +
          `• Images sent: *${stats.images}*\n` +
          `• Videos sent: *${stats.videos}*\n` +
          `• Last media activity: *${lastText}*\n\n` +
          "To send one of your photos or videos to another person, use WhatsApp's forward/share feature.\n" +
          "_For privacy, this bot does not read your device gallery directly._"
      });
      return;
    }

    // 1️⃣ File system menu
    if (lower.startsWith("fs ")) {
      const args = text.slice(3).trim();
      if (!args) {
        await sock.sendLoggedMessage(sender, {
          text:
            "📂 *File System Commands*\n" +
            "- `fs help` – show commands\n" +
            "- `fs create <name> | <content>`\n" +
            "- `fs read <name>`\n" +
            "- `fs delete <name>`\n" +
            "- `fs info <name>`\n" +
            "- `fs list`"
        });
        return;
      }

      const [cmd, ...restTokens] = args.split(" ");
      const cmdLower = cmd.toLowerCase();
      const rest = restTokens.join(" ").trim();

      if (cmdLower === "help") {
        await sock.sendLoggedMessage(sender, {
          text:
            "📂 *File System Commands*\n\n" +
            "• `fs create <name> | <content>` – create/overwrite a file\n" +
            "• `fs read <name>` – read file content\n" +
            "• `fs delete <name>` – delete a file\n" +
            "• `fs info <name>` – show file size & timestamps\n" +
            "• `fs list` – list all files in sandbox\n\n" +
            "_All files are stored in a safe sandbox inside the bot, not your real device files._"
        });
        return;
      }

      try {
        if (cmdLower === "list") {
          const entries = await fs.readdir(FILE_BASE_DIR);
          if (!entries.length) {
            await sock.sendLoggedMessage(sender, {
              text: "📂 No files yet. Use `fs create <name> | <content>` to create one."
            });
            return;
          }
          await sock.sendLoggedMessage(sender, {
            text: "📂 *Files in sandbox:*\n- " + entries.join("\n- ")
          });
          return;
        }

        if (cmdLower === "create") {
          const [namePart, ...contentParts] = rest.split("|");
          const rawName = (namePart || "").trim();
          const content = contentParts.join("|").trim();

          const safeName = sanitizeFileName(rawName);
          if (!safeName) {
            await sock.sendLoggedMessage(sender, {
              text: "⚠️ Invalid file name. Avoid slashes or `..`.\nExample: `fs create notes.txt | hello world`"
            });
            return;
          }

          const target = path.join(FILE_BASE_DIR, safeName);
          await fs.writeFile(target, content || "", "utf8");

          const stats = await fs.stat(target);
          await sock.sendLoggedMessage(sender, {
            text: `✅ File *${safeName}* saved.\nSize: ${formatFileSize(stats.size)}`
          });
          return;
        }

        if (cmdLower === "read") {
          const safeName = sanitizeFileName(rest);
          if (!safeName) {
            await sock.sendLoggedMessage(sender, {
              text: "⚠️ Invalid file name.\nExample: `fs read notes.txt`"
            });
            return;
          }

          const target = path.join(FILE_BASE_DIR, safeName);
          const data = await fs.readFile(target, "utf8").catch(() => null);
          if (data === null) {
            await sock.sendLoggedMessage(sender, {
              text: `❌ File *${safeName}* not found.`
            });
            return;
          }

          await sock.sendLoggedMessage(sender, {
            text: `📄 *${safeName}*:\n\n${data || "_(empty file)_"}`
          });
          return;
        }

        if (cmdLower === "delete") {
          const safeName = sanitizeFileName(rest);
          if (!safeName) {
            await sock.sendLoggedMessage(sender, {
              text: "⚠️ Invalid file name.\nExample: `fs delete notes.txt`"
            });
            return;
          }

          const target = path.join(FILE_BASE_DIR, safeName);
          await fs.unlink(target).catch(() => null);

          await sock.sendLoggedMessage(sender, {
            text: `🗑️ If it existed, file *${safeName}* is deleted from sandbox.`
          });
          return;
        }

        if (cmdLower === "info") {
          const safeName = sanitizeFileName(rest);
          if (!safeName) {
            await sock.sendLoggedMessage(sender, {
              text: "⚠️ Invalid file name.\nExample: `fs info notes.txt`"
            });
            return;
          }

          const target = path.join(FILE_BASE_DIR, safeName);
        const stats = await fs.stat(target).catch(() => null);
        if (!stats) {
          await sock.sendLoggedMessage(sender, {
            text: `❌ File *${safeName}* not found.`
          });
          return;
        }

          await sock.sendLoggedMessage(sender, {
            text:
              `📊 *Info for ${safeName}*\n` +
              `- Size: ${formatFileSize(stats.size)}\n` +
              `- Created: ${stats.birthtime.toLocaleString()}\n` +
              `- Updated: ${stats.mtime.toLocaleString()}`
          });
          return;
        }
      } catch (err) {
        console.error("FS error:", err);
        await sock.sendLoggedMessage(sender, {
          text: "❌ Something went wrong with the file system command."
        });
      }

      return;
    }

    // 2️⃣ Songs menu
    if (
      lower.startsWith("song ") ||
      lower.startsWith("play song ")
    ) {
      const query = lower.startsWith("song ")
        ? text.slice(5).trim()
        : text.slice("play song".length).trim();

      if (!query) {
        await sock.sendLoggedMessage(sender, {
          text: "🎵 Type like: `song despacito` or `play song love story`."
        });
        return;
      }

      const mainUrl = youtubeSearchUrl(`${query} official audio`);
      const related = [
        youtubeSearchUrl(`${query} remix`),
        youtubeSearchUrl(`${query} lyrics`),
        youtubeSearchUrl(`${query} slowed reverb`)
      ];

          await sock.sendLoggedMessage(sender, {
        text:
          `🎧 *Song Search for:* ${query}\n\n` +
          `▶️ Main: ${mainUrl}\n\n` +
          `🔁 Related:\n- ${related[0]}\n- ${related[1]}\n- ${related[2]}\n\n` +
          "_Open these links to play the song on YouTube._"
      });
      return;
    }

    // 3️⃣ Video menu
    if (lower.startsWith("video ")) {
      const query = text.slice("video ".length).trim();
      if (!query) {
        await sock.sendLoggedMessage(sender, {
          text: "📺 Type like: `video programming tutorial`."
        });
        return;
      }

      const mainUrl = youtubeSearchUrl(`${query}`);
      const related = [
        youtubeSearchUrl(`${query} 4k`),
        youtubeSearchUrl(`${query} full`),
        youtubeSearchUrl(`${query} best`)
      ];

        await sock.sendLoggedMessage(sender, {
        text:
          `📺 *Video Search for:* ${query}\n\n` +
          `▶️ Main: ${mainUrl}\n\n` +
          `🎬 Related:\n- ${related[0]}\n- ${related[1]}\n- ${related[2]}\n\n` +
          "_Open these links to watch the video on YouTube._"
      });
      return;
    }

    // 4️⃣ Chat with Mazhar.DevX persona
    if (
      lower.startsWith("mazhar.devx") ||
      lower.startsWith("mazhar devx") ||
      lower.startsWith("/talk")
    ) {
      const userMessage = text
        .replace(/^mazhar\.devx/i, "")
        .replace(/^mazhar devx/i, "")
        .replace(/^\/talk/i, "")
        .trim();

      let reply = "";

      if (!userMessage) {
        reply =
          "👨‍💻 Hey, I’m *Mazhar.DevX*.\n" +
          "I’m your full-stack dev friend inside this bot.\n" +
          "Ask me anything about coding, projects, or life as a developer.";
      } else if (userMessage.toLowerCase().includes("how are you")) {
        reply =
          "😎 I’m running at 0 errors and 60 fps.\n" +
          "How are *you* doing today?";
      } else if (userMessage.toLowerCase().includes("help")) {
        reply =
          "🧠 I’m here to help.\n" +
          "Tell me what you’re trying to build, and I’ll guide you step by step like a real teammate.";
      } else if (
        userMessage.toLowerCase().includes("project") ||
        userMessage.toLowerCase().includes("website") ||
        userMessage.toLowerCase().includes("app")
      ) {
        reply =
          "🚀 Sounds like a solid project idea.\n" +
          "Describe the features you want, and I’ll break it into a clean technical plan for you.";
      } else {
        reply =
          `💬 You said: "${userMessage}"\n\n` +
          "I’m *Mazhar.DevX* – answering you like a real dev.\n" +
          "If you want something specific (code, project ideas, tech advice), tell me clearly and I’ll respond like your senior dev friend.";
      }

      await sock.sendLoggedMessage(sender, { text: reply });
      return;
    }

    // Default fallback
    await sock.sendLoggedMessage(sender, {
      text:
        "🤖 I didn’t understand that.\n" +
        "Type `menu` to see everything I can do."
    });
  });
}

startBot();
