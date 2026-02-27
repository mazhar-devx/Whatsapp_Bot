const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const QR_PATH = path.join(process.cwd(), "user_files", "login-qr.png");

function startWebServer() {
    const server = http.createServer((req, res) => {
        if (req.url === "/qr") {
            if (fs.existsSync(QR_PATH)) {
                res.writeHead(200, { "Content-Type": "image/png" });
                fs.createReadStream(QR_PATH).pipe(res);
            } else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("QR code not generated yet. Please wait or check bot logs.");
            }
        } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
                <html>
                    <head><title>Mazhar DevX Bot QR</title></head>
                    <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
                        <h1>💎 Mazhar DevX Bot</h1>
                        <p>Scan the QR code below to login:</p>
                        <a href="/qr" style="color: #38bdf8; text-decoration: none; border: 1px solid #38bdf8; padding: 10px 20px; border-radius: 5px;">View QR Code</a>
                    </body>
                </html>
            `);
        }
    });

    server.listen(PORT, "0.0.1", () => {
        console.log(`🌐 [SYSTEM] Web Server running at http://localhost:${PORT}`);
        console.log(`🔗 [SYSTEM] QR Page: http://localhost:${PORT}/qr`);
    });
}

module.exports = { startWebServer };
