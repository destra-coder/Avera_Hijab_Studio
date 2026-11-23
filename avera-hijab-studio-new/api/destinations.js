"use strict";

var h = require("../lib/http");
var ro = require("../lib/rajaongkir");

// GET /api/destinations?search=kebayoran -> [{ id, label }]
module.exports = h.handler(["GET"], async function (req, res) {
  h.rateLimit(req, "dest", 60, 60 * 1000);
  var q = String((req.query && req.query.search) || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60);
  if (q.length < 3) return h.send(res, 200, { data: [] });
  var data = await ro.searchDestinations(q, 8);
  h.send(res, 200, { data: data }, { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" });
});
