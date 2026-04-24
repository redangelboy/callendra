const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "0.0.0.0";
const useHttps = dev && process.env.DEV_HTTPS === "1";
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, "certs", "dev-key.pem");
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, "certs", "dev-cert.pem");

const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

function attachSocketIo(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });
  global.io = io;
  io.on("connection", (socket) => {
    socket.on("join-display", (slug) => {
      socket.join(`display-${slug}`);
      console.log("Display joined:", slug);
    });
  });
}

function createRequestListener() {
  return (req, res) => {
    const parsedUrl = parse(req.url, true);

    if (req.method === "POST" && parsedUrl.pathname === "/api/internal/emit") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { room, event, data } = JSON.parse(body);
          if (global.io) {
            global.io.to(room).emit(event, data);
            console.log("IO emitted:", event, "to", room);
          } else {
            console.log("IO not available");
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }

    handle(req, res, parsedUrl);
  };
}

app.prepare().then(() => {
  const listener = createRequestListener();
  let httpServer;

  if (useHttps) {
    let key;
    let cert;
    try {
      key = fs.readFileSync(keyPath);
      cert = fs.readFileSync(certPath);
    } catch (e) {
      console.error(
        "\n[dev https] Could not read TLS files.\n" +
          `  key:  ${keyPath}\n` +
          `  cert: ${certPath}\n` +
          "  Install mkcert (https://github.com/FiloSottile/mkcert), then from the project root:\n" +
          "    mkdir -p certs && cd certs\n" +
          "    mkcert -install\n" +
          "    mkcert localhost 127.0.0.1 ::1 $(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}')\n" +
          "  Rename the generated *-key.pem to dev-key.pem and *.pem (not key) to dev-cert.pem,\n" +
          "  or set SSL_KEY_PATH and SSL_CERT_PATH.\n"
      );
      process.exit(1);
    }
    httpServer = https.createServer({ key, cert }, listener);
    attachSocketIo(httpServer);
    httpServer.listen(port, host, () => {
      console.log(`> Ready on https://${host}:${port} (LAN: use your Mac IP with https://)`);
      console.log("> On iPhone: trust the mkcert CA (Settings → General → About → Certificate Trust).");
    });
  } else {
    httpServer = http.createServer(listener);
    attachSocketIo(httpServer);
    httpServer.listen(port, host, () => {
      console.log(`> Ready on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
      console.log(
        "> Camera/QR on another device needs HTTPS. Run: npm run dev:https (see server.js for mkcert)."
      );
    });
  }
});
