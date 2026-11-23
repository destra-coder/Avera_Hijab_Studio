"use strict";
// Server lokal tanpa dependency: sajikan /public dan jalankan handler /api/*.
// Pakai: salin .env.example ke .env.local, isi, lalu `npm run dev` (http://localhost:3000).
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

try {
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !l.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (e) { /* .env.local tidak wajib */ }

const types = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const apiRoot = path.join(root, "api");
    const rel = u.pathname.slice(5).split("/").filter(Boolean).join(path.sep);
    const file = path.resolve(apiRoot, rel + ".js");
    if (!file.startsWith(apiRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end("Not found"); }
    req.query = Object.fromEntries(u.searchParams);
    return require(file)(req, res);
  }
  let relPublic = u.pathname === "/" ? "index.html" : u.pathname.replace(/^\/+/, "");
  let p = path.resolve(root, "public", relPublic);
  if (!p.startsWith(path.join(root, "public") + path.sep) && p !== path.join(root, "public")) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", types[path.extname(p)] || "application/octet-stream");
    res.end(buf);
  });
}).listen(process.env.PORT || 3000, () => console.log("Dev server: http://localhost:" + (process.env.PORT || 3000)));
