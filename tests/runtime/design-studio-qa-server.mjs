// Local QA fixture only. Never included in the Worker or deployment archive.
// Identity is simulated exclusively on loopback; data exists only in memory.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { api } from "../../worker/index.js";
const sql = new DatabaseSync(":memory:");
for (const file of (await fs.readdir("drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sql.exec(await fs.readFile("drizzle/" + file, "utf8"));
const objects = new Map();
const env = {
  DB: {
    prepare(query) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async first() {
          return sql.prepare(query).get(...args);
        },
        async all() {
          return { results: sql.prepare(query).all(...args) };
        },
        async run() {
          return {
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  },
  BUCKET: {
    async put(key, data, options) {
      objects.set(key, { data, options });
    },
    async get(key) {
      const value = objects.get(key);
      return value
        ? {
            text: async () => value.data,
            customMetadata: value.options?.customMetadata || {},
          }
        : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  },
};
const root = path.resolve("dist/gymtrack/browser"),
  origin = "http://localhost:4173";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
};
http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/")) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const headers = new Headers(req.headers);
        headers.set("oai-authenticated-user-id", "qa-owner");
        headers.set(
          "oai-authenticated-user-email",
          "giacomotanduo004@gmail.com",
        );
        const body = Buffer.concat(chunks);
        const response = await api(
          new Request(origin + req.url, {
            method: req.method,
            headers,
            ...(body.length ? { body } : {}),
          }),
          env,
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = new URL(req.url, origin).pathname,
        file = path.resolve(
          root,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch (error) {
      res
        .writeHead(500, { "Content-Type": "text/plain" })
        .end("QA fixture error: " + error.message);
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("Design Studio QA fixture: " + origin),
  );
