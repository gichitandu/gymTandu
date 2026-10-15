// Local production preview. Service workers are permitted on localhost.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist/gymtrack/browser");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (pathname.endsWith("/")) pathname += "index.html";
      const target = path.resolve(root, "." + pathname);
      if (!target.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end("File non trovato");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("GymTrack: http://localhost:4173"),
  );
