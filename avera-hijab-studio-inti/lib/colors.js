"use strict";

var sb = require("./supabase");
var defaults = require("./catalog").COLORS;

function byDefault(slug) {
  for (var i = 0; i < defaults.length; i++) if (defaults[i].slug === slug) return defaults[i];
  return null;
}

// Ambil daftar warna. Sumber utama: tabel Supabase `colors` (stok dan status aktif).
// Jika Supabase belum tersambung atau gagal, pakai daftar bawaan (stok tidak diketahui).
async function getColors() {
  var fallback = defaults.map(function (c) {
    return { slug: c.slug, name: c.name, hex: c.hex, image: c.image, featured: c.featured, sort: c.sort, stock: null, active: true };
  });
  if (!sb.enabled()) return { colors: fallback, source: "default" };
  try {
    var rows = await sb.rest("colors?select=slug,name,hex,image,stock,active,featured,sort&order=sort.asc");
    if (!Array.isArray(rows) || !rows.length) return { colors: fallback, source: "default" };
    return {
      source: "supabase",
      colors: rows.map(function (r) {
        var d = byDefault(r.slug) || {};
        return {
          slug: r.slug,
          name: r.name,
          hex: r.hex || d.hex || "#cccccc",
          image: r.image || d.image || null,
          featured: !!r.featured,
          sort: r.sort || 0,
          stock: r.stock === null || r.stock === undefined ? null : Number(r.stock),
          active: r.active !== false,
        };
      }),
    };
  } catch (e) {
    console.error("getColors gagal, pakai bawaan:", e.message);
    return { colors: fallback, source: "default" };
  }
}

module.exports = { getColors: getColors };
