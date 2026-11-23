"use strict";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, data, headers) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (headers) Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
  res.end(JSON.stringify(data));
}

// Pembatas request sederhana per IP (disimpan di memori instance; cukup untuk meredam spam ringan).
var buckets = new Map();
function rateLimit(req, name, max, windowMs) {
  var fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  var ip = fwd || (req.socket && req.socket.remoteAddress) || "unknown";
  var key = name + ":" + ip;
  var now = Date.now();
  var b = buckets.get(key);
  if (!b || now > b.reset) b = { n: 0, reset: now + windowMs };
  b.n += 1;
  buckets.set(key, b);
  if (buckets.size > 5000) {
    buckets.forEach(function (v, k) { if (now > v.reset) buckets.delete(k); });
  }
  if (b.n > max) throw new HttpError(429, "Terlalu banyak permintaan. Coba lagi sebentar.");
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body)); }
    catch (e) { throw new HttpError(400, "Format data tidak valid."); }
  }
  var chunks = [], size = 0;
  for await (var ch of req) {
    size += ch.length;
    if (size > 50 * 1024) throw new HttpError(413, "Data terlalu besar.");
    chunks.push(ch);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch (e) { throw new HttpError(400, "Format data tidak valid."); }
}

function handler(methods, fn) {
  return async function (req, res) {
    try {
      if (methods.indexOf(req.method) === -1) {
        res.setHeader("Allow", methods.join(", "));
        throw new HttpError(405, "Method tidak diizinkan.");
      }
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: "Terjadi kesalahan di server. Coba lagi sebentar." });
    }
  };
}

module.exports = { HttpError: HttpError, send: send, readBody: readBody, handler: handler, rateLimit: rateLimit };
