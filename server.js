const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);

    // Interceptar emit interno antes de Next.js
    if (req.method === "POST" && parsedUrl.pathname === "/api/internal/emit") {
      let body = "";
      req.on("data", chunk => body += chunk);
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
  });

  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  global.io = io;

  io.on("connection", (socket) => {
    socket.on("join-display", (slug) => {
      socket.join(`display-${slug}`);
      console.log("Display joined:", slug);
    });
  });

  httpServer.listen(3000, () => {
    console.log("> Ready on http://localhost:3000");
  });
});
