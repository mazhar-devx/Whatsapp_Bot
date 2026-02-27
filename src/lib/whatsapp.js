const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const Pino = require("pino");
const qrcodeTerm = require("qrcode-terminal");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

async function connectToWhatsApp(authPath = "auth") {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: Pino({ level: "silent" }),
        browser: ["Mazhar DevX Elite", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            console.log("\n📱 [SYSTEM] NEW QR CODE DETECTED!");

            // 1. Generate Terminal QR
            console.log("👉 Terminal View:");
            qrcodeTerm.generate(qr, { small: true });

            // 2. Generate Image file for Browser
            try {
                const qrPath = path.join(process.cwd(), "user_files", "login-qr.png");
                await QRCode.toFile(qrPath, qr, {
                    color: {
                        dark: '#000000',
                        light: '#ffffff'
                    },
                    width: 500
                });

                console.log("📸 [SYSTEM] QR saved as image in: user_files/login-qr.png");
                console.log("\n🔗 [BROWSER LINK] CLICK BELOW TO VIEW QR IN BROWSER:");
                console.log(`\x1b[36mfile:///${qrPath.replace(/\\/g, "/")}\x1b[0m\n`);

            } catch (err) {
                console.error("❌ [SYSTEM] Failed to generate QR image:", err.message);
            }
        }

        if (connection === "open") {
            console.log("🚀 [SYSTEM] WhatsApp Bot is ONLINE and ready!");
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            console.log("⚠️ [SYSTEM] Connection closed. Reason ID:", statusCode);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log("❌ [SYSTEM] Logged out. Please reset 'auth' folder.");
            }
        }
    });

    return sock;
}

module.exports = { connectToWhatsApp };
