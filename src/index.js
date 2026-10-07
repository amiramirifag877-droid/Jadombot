import "dotenv/config";
import http from "node:http";
import bot from "./bot.js";
import { initDb } from "./db.js";

const port = Number(process.env.PORT || 10000);

await initDb();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "jado-movie-bot" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("JadoMovie bot is running.");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`HTTP server listening on ${port}`);
});

await bot.launch();
console.log("Telegram bot started.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
