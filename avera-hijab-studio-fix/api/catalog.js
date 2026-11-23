"use strict";

var h = require("../lib/http");
var cfg = require("../lib/config");
var sb = require("../lib/supabase");
var ro = require("../lib/rajaongkir");
var getProducts = require("../lib/products").getProducts;

// GET /api/catalog -> katalog multi-produk. Properti legacy dipertahankan sementara
// agar website versi lama tetap dapat membaca produk pertama.
module.exports = h.handler(["GET"], async function (req, res) {
  var out = await getProducts();
  var products = out.products.filter(function (p) { return p.active; });
  var first = products[0] || null;
  var legacyColors = first ? first.variants.map(function (v) {
    return { slug: v.slug, name: v.name, hex: v.color_hex || v.hex || "#cccccc", image: v.image,
      stock: v.stock, active: v.active, featured: v.featured, sort: v.sort };
  }).filter(function (v) { return v.active; }) : [];
  h.send(res, 200, {
    products: products,
    catalog_source: out.source,
    // Compatibility fields for the old single-product frontend.
    product: first ? { id: first.id, slug: first.slug, name: first.name, price: first.price,
      compare_price: first.compare_price, weight_gram: first.weight_gram } : null,
    colors: legacyColors,
    max_qty: cfg.MAX_QTY_PER_COLOR,
    max_qty_total: cfg.MAX_QTY_TOTAL,
    features: { orders: sb.enabled(), shipping: ro.shippingEnabled() }
  }, { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" });
});
