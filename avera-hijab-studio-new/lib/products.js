"use strict";

var sb = require("./supabase");
var legacy = require("./config");
var getColors = require("./colors").getColors;

function fallbackProducts() {
  return getColors().then(function (out) {
    return [{
      id: null,
      slug: legacy.PRODUCT.slug,
      name: legacy.PRODUCT.name,
      description: legacy.PRODUCT.name,
      price: legacy.PRODUCT.price,
      compare_price: legacy.PRODUCT.compare_price,
      cost_price: null,
      weight_gram: legacy.PRODUCT.weight_gram,
      image: null,
      active: true,
      featured: true,
      sort: 10,
      variants: out.colors.map(function (c) {
        return {
          id: null, product_id: null, slug: c.slug, sku: null, name: c.name,
          color_hex: c.hex, hex: c.hex, image: c.image, stock: c.stock,
          active: c.active, featured: c.featured, sort: c.sort, attributes: {}
        };
      })
    }];
  });
}


async function getProducts() {
  if (!sb.enabled()) return { products: await fallbackProducts(), source: "fallback" };
  try {
    var rows = await sb.rest("products?select=id,slug,name,description,price,compare_price,cost_price,weight_gram,image,active,featured,sort&active=eq.true&order=sort.asc,name.asc");
    if (!Array.isArray(rows) || !rows.length) return { products: await fallbackProducts(), source: "fallback" };
    var ids = rows.map(function (p) { return p.id; }).filter(Boolean);
    var variants = ids.length ? await sb.rest("product_variants?select=id,product_id,slug,sku,name,color_hex,image,stock,active,featured,sort,attributes&product_id=in.(" + ids.join(",") + ")&active=eq.true&order=sort.asc,name.asc") : [];
    var grouped = {};
    (Array.isArray(variants) ? variants : []).forEach(function (v) {
      (grouped[v.product_id] = grouped[v.product_id] || []).push({
        id: v.id, product_id: v.product_id, slug: v.slug, sku: v.sku,
        name: v.name, color_hex: v.color_hex, hex: v.color_hex,
        image: v.image, stock: v.stock === null || v.stock === undefined ? null : Number(v.stock),
        active: v.active !== false, featured: !!v.featured, sort: Number(v.sort || 0),
        attributes: v.attributes || {}
      });
    });
    return {
      source: "supabase",
      products: rows.map(function (p) {
        return {
          id: p.id, slug: p.slug, name: p.name, description: p.description,
          price: Number(p.price), compare_price: p.compare_price === null ? null : Number(p.compare_price),
          cost_price: p.cost_price === null ? null : Number(p.cost_price),
          weight_gram: Number(p.weight_gram || legacy.PRODUCT.weight_gram),
          image: p.image, active: p.active !== false, featured: !!p.featured,
          sort: Number(p.sort || 0), variants: grouped[p.id] || []
        };
      })
    };
  } catch (e) {
    console.error("getProducts gagal, pakai katalog fallback:", e.message);
    return { products: await fallbackProducts(), source: "fallback" };
  }
}


module.exports = { getProducts: getProducts, fallbackProducts: fallbackProducts };
