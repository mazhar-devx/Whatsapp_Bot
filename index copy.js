const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const Pino = require("pino");
const qrcode = require("qrcode-terminal");

async function startBot() {
  console.log("⏳ Starting WhatsApp Bot...");

  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state,
    logger: Pino({ level: "silent" })
  });

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
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ Connection closed. Reason:", reason);

      if (reason !== DisconnectReason.loggedOut) {
        startBot();
      }
    }
  });

  // ✅ Message handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text;

    const sender = msg.key.remoteJid;

    console.log("📩 Message received:", text);

 if (text === "/premium") {
  await sock.sendMessage(sender, {
    text: `💎 *DriveUp Premium Packages*

1️⃣ *Basic (Tier 1 - 3 Days)* — Rs. 150
  ✅ Uploading (Limit: 2000f & 150sf per link)
  ✅ Concurrent Uploads: 2
  ✅ Speed: Slow Speed
  ❌ All Other Features

2️⃣ *Intermediate (Tier 2 - 7 Days)* — Rs. 250
  ✅ Unlimited Uploads (Limit: 5000f & 280sf per link)
  ✅ Renaming Features (\`setre\`, \`re\`)
  ✅ Concurrent Uploads: 4
  ✅ Speed: Slow Speed
  ❌ All Other Features

4️⃣ *Pro (Tier 4 - 15 Days)* — Rs. 450
  ✅ Unlimited Uploads (Limit: 8000f & 420sf per link)
  ✅ Concurrent Uploads: 10
  ✅ Speed: Normal Speed
  ✅ Renaming Features (\`setre\`, \`re\`)
  ✅ Link Management (\`pub\`, \`priv\`, \`del\`)
  ✅ Drive Info (\`storage\`, \`size\`)
  ❌ Content Tools (\`setcf\`, \`cf\`, \`df\`, \`dup\`)

3️⃣ *Advanced (Tier 3 - 30 Days)* — Rs. 750
  ✅ All Features Unlocked (Unlimited Uploads)
  ✅ Concurrent Uploads: Unlimited
  ✅ Speed: Fast Speed
  ✅ Trash Management (\`dlttrash\`, \`recovertrash\`)
  ✅ Content Tools (\`setcf\`, \`cf\`, \`df\`, \`dup\`)

5️⃣ *Ultra (Tier 5 - 30 Days)* — Rs. 1000
  ✅ All Features of Tier 3
  ✅ Speed: Ultra Blazing Speed
  ✅ Intelligent Dual Authorization
  ✅ Advanced Renaming (\`setre\`, \`re\`, \`delre\`)
  ✅ Targeted Uploads (\`setfolder\`, \`<cmd>1 LINK NAME\`, \`<cmd>2 LINK NAME\`)

💳 Payment Details
*📱 Account Number:* 0346-8371101
*👤 Account Name:* Anwar-ul-Haq
*🏦 Type:* JazzCash

📸 Send screenshot after payment.
🕐 Wait for admin approval.`
  });
}


  });
}

startBot();






