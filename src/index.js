require("dotenv").config();
const { connectToWhatsApp } = require("./lib/whatsapp");
const { handleMessage, handlePresence } = require("./handlers/message");
const { startWebServer } = require("./services/web");

startWebServer();

let conflictCounter = 0;
let sock = null; // Global sock reference to manage state

async function startSystem() {
    process.title = "Mazhar-DevX-Bot";
    console.log("💎 [SYSTEM] Initializing Mazhar DevX Elite v2.0...");
    console.log(`🆔 [SYSTEM] Process ID: ${process.pid}`);
    console.log("🚀 [SYSTEM] Starting fresh session. Scanning QR may be required.");

    try {
        // Clean up previous socket if it exists to prevent leaks
        if (sock) {
            console.log("🧹 [SYSTEM] Cleaning up previous socket instance...");
            sock.ev.removeAllListeners();
            if (sock.ws) {
                try { sock.ws.close(); } catch (e) { }
            }
        }

        sock = await connectToWhatsApp();

        // ✅ Centralized Connection Monitor
        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                conflictCounter = 0; // Reset on success
                console.log("✨ [SYSTEM] All systems operational.");
                return;
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;

                // Detailed Conflict Detection
                const isConflict = statusCode === 440 || statusCode === 500 || statusCode === 403;

                if (isConflict) {
                    conflictCounter++;
                    console.warn("\n🛑 [CRITICAL CONFLICT] Connection was forcefully closed.");
                    console.warn(`👉 REASON: Another terminal is running this bot! (Current PID: ${process.pid})`);
                    console.warn("👉 ACTION: CLOSE ALL OTHER TERMINAL TABS (even hidden ones).\n");

                    if (conflictCounter >= 2) {
                        console.error("🔥 [SYSTEM] Persistent conflict. Auto-stopping. Please clear ALL terminals.");
                        process.exit(1);
                    }
                }

                // If it's not a manual logout, attempt to reconnect
                if (statusCode !== 401) {
                    const delay = isConflict ? 20000 : 5000;
                    console.log(`🔄 [SYSTEM] Reconnecting in ${delay / 1000}s... (Code: ${statusCode})`);
                    setTimeout(startSystem, delay);
                } else {
                    console.log("❌ [SYSTEM] Session expired or Logged Out. Please rescan.");
                }
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            for (const msg of messages) {
                await handleMessage(sock, msg);
            }
        });

        sock.ev.on("presence.update", (update) => {
            handlePresence(update);
        });

        // ✅ [NEW] Call Handling (Auto-Reject & Explain)
        sock.ev.on("call", async (calls) => {
            for (const call of calls) {
                if (call.status === "offer") {
                    console.log(`📞 [CALL] Incoming call from ${call.from}. Rejecting...`);
                    // Reject the call
                    await sock.rejectCall(call.id, call.from);

                    // Send an AI-generated explanation
                    const name = call.from.split('@')[0];
                    const callPrompt = `[CALL_REJECTION_EVENT]: User tried to call me. Explain that I am a bot/automation and cannot attend calls. Tell them to message me instead. Be polite and human like Mazhar. Match their presumed language or Urdu/English.`;

                    const { mazharAiReply } = require("./services/ai");
                    const { safeSendMessage } = require("./handlers/message");

                    const reply = await mazharAiReply(callPrompt, call.from, name);
                    await safeSendMessage(sock, call.from, { text: reply });
                }
            }
        });

    } catch (err) {
        console.error("❌ [SYSTEM] Critical boot failure. Retrying in 10s...", err.message);
        setTimeout(startSystem, 10000);
    }
}

startSystem();
