"use strict";
// Tes tanpa jaringan: fetch ke RajaOngkir dan Supabase diganti tiruan.
// Jalankan: npm test
const assert = require("assert");
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
process.env.RAJAONGKIR_API_KEY = "k";
process.env.RAJAONGKIR_ORIGIN_ID = "1234";

const colorRows = require("../lib/catalog").COLORS.map((c) => ({ slug: c.slug, name: c.name, hex: c.hex, image: c.image, featured: c.featured, sort: c.sort, active: c.slug !== "black", stock: c.slug === "moss" ? 0 : c.slug === "nude" ? 2 : null }));
const inserted = [];
const calls = [];
global.fetch = async (url, opts) => {
  opts = opts || {};
  calls.push({ url: String(url), opts });
  const u = String(url);
  const ok = (data, status) => ({ ok: (status || 200) < 400, status: status || 200, text: async () => JSON.stringify(data), json: async () => data });
  if (u.includes("/rest/v1/colors")) return ok(colorRows);
  if (u.includes("/rest/v1/products")) return ok([{
    id: "product-test-id", slug: "pashmina-avera", name: "Pashmina Avera", description: "Pashmina Avera",
    price: 59000, compare_price: 65000, cost_price: null, weight_gram: 200,
    image: null, active: true, featured: true, sort: 10
  }]);
  if (u.includes("/rest/v1/product_variants")) return ok(colorRows.filter((c) => c.active).map((c) => ({
    id: "variant-" + c.slug, product_id: "product-test-id", slug: c.slug, sku: "SKU-" + c.slug,
    name: c.name, color_hex: c.hex, image: c.image, stock: c.stock,
    active: c.active, featured: c.featured, sort: c.sort, attributes: {}
  })));
  if (u.includes("/rest/v1/rpc/avera_create_order_atomic")) { inserted.push(JSON.parse(opts.body).p_order); return ok({ order_code: JSON.parse(opts.body).p_order.order_code }); }
  if (u.includes("domestic-destination")) return ok({ meta: { code: 200 }, data: [{ id: 17549, label: "KEBAYORAN LAMA, JAKARTA SELATAN, DKI JAKARTA, 12240", zip_code: "12240" }] });
  if (u.includes("domestic-cost")) {
    const p = new URLSearchParams(opts.body);
    assert.strictEqual(opts.headers.key, "k");
    assert.strictEqual(p.get("origin"), "1234");
    const cs = p.get("courier").split(":");
    const rows = [];
    if (cs.includes("jne")) rows.push({ name: "Jalur Nugraha Ekakurir (JNE)", code: "jne", service: "REG", description: "Layanan Reguler", cost: 12000, etd: "2 day" });
    if (cs.includes("jnt")) rows.push({ name: "J&T Express", code: "jnt", service: "EZ", description: "Regular", cost: 10000, etd: "3 day" });
    return ok({ meta: { code: 200 }, data: rows });
  }
  throw new Error("URL tak terduga " + u);
};

function run(handler, method, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const req = { method, headers: { "x-forwarded-for": "9.9.9." + Math.floor(Math.random() * 250) }, query: opts.query || {}, body: opts.body, socket: {} };
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, json: JSON.parse(b), headers: this.headers }); } };
    handler(req, res);
  });
}

(async () => {
  const adminConfig = await run(require("../api/admin-config"), "GET");
  assert.strictEqual(adminConfig.status, 200);
  assert.strictEqual(adminConfig.json.anonKey, "sb_publishable_test");
  assert.ok(adminConfig.headers["Cache-Control"].includes("no-store"));

  const catalog = await run(require("../api/catalog"), "GET");
  assert.strictEqual(catalog.status, 200);
  assert.strictEqual(catalog.json.products.length, 1);
  assert.strictEqual(catalog.json.products[0].variants.length, 11);
  assert.strictEqual(catalog.json.catalog_source, "supabase");
  assert.strictEqual(catalog.json.product.price, 59000);
  assert.strictEqual(catalog.json.product.compare_price, 65000);
  assert.strictEqual(catalog.json.colors.length, 11, "black non-aktif disembunyikan");
  assert.ok(catalog.json.features.orders && catalog.json.features.shipping);
  // key sb_secret tidak boleh jadi Bearer
  const sbCall = calls.find((c) => c.url.includes("/rest/v1/products"));
  assert.strictEqual(sbCall.opts.headers.Authorization, undefined);
  assert.strictEqual(sbCall.opts.headers.apikey, "sb_secret_test");

  const dest = await run(require("../api/destinations"), "GET", { query: { search: "kebayoran" } });
  assert.strictEqual(dest.json.data[0].id, 17549);
  assert.deepStrictEqual((await run(require("../api/destinations"), "GET", { query: { search: "ke" } })).json.data, []);

  const ship = await run(require("../api/shipping"), "POST", { body: { destination_id: 17549, qty: 3 } });
  assert.strictEqual(ship.status, 200);
  assert.strictEqual(ship.json.weight, 600);
  assert.deepStrictEqual(ship.json.options.map((o) => o.cost), [10000, 12000], "urut termurah");
  const multiShip = await run(require("../api/shipping"), "POST", { body: { destination_id: 17549, items: [
    { product_slug: "pashmina-avera", variant_slug: "coral", qty: 2 },
    { product_slug: "pashmina-avera", variant_slug: "latte", qty: 1 }
  ] } });
  assert.strictEqual(multiShip.status, 200);
  assert.strictEqual(multiShip.json.weight, 600, "berat ongkir dihitung dari berat produk x qty");

  const good = { name: "Siti", phone: "0812-3456-7890", address: "Jl. Mawar No. 5 RT 1/2", destination_id: 17549, destination_label: "KEBAYORAN LAMA", courier: "jne", service: "REG", items: [{ product_slug: "pashmina-avera", variant_slug: "coral", qty: 2 }, { product_slug: "pashmina-avera", variant_slug: "coral", qty: 1 }, { product_slug: "pashmina-avera", variant_slug: "latte", qty: 1 }] };
  const ord = await run(require("../api/order"), "POST", { body: good });
  assert.strictEqual(ord.status, 201, JSON.stringify(ord.json));
  assert.strictEqual(ord.json.subtotal, 4 * 59000);
  assert.strictEqual(ord.json.total, 4 * 59000 + 12000);
  assert.match(ord.json.order_code, /^AVR-\d{6}-[0-9A-F]{6}$/);
  assert.strictEqual(inserted[0].customer_phone, "6281234567890");
  assert.strictEqual(inserted[0].items.length, 2);
  assert.strictEqual(inserted[0].items[0].quantity, 3);
  assert.strictEqual(inserted[0].items[0].unit_price, 59000);
  const msg = decodeURIComponent(ord.json.whatsapp_url.split("text=")[1]);
  assert.ok(msg.includes(ord.json.order_code) && msg.includes("Rp248.000") && msg.includes("JNE"));
  assert.ok(ord.json.whatsapp_url.startsWith("https://wa.me/6285181938959?text="));

  // harga/ongkir dari browser diabaikan
  const spoof = await run(require("../api/order"), "POST", { body: Object.assign({}, good, { price: 1, shipping_cost: 0, total: 1 }) });
  assert.strictEqual(spoof.json.total, 4 * 59000 + 12000);

  const cases = [
    [{ items: [{ product_slug: "pashmina-avera", variant_slug: "moss", qty: 1 }] }, 409, "stok habis"],
    [{ items: [{ product_slug: "pashmina-avera", variant_slug: "nude", qty: 3 }] }, 409, "melebihi stok"],
    [{ items: [{ product_slug: "pashmina-avera", variant_slug: "black", qty: 1 }] }, 409, "warna nonaktif"],
    [{ items: [{ product_slug: "pashmina-avera", variant_slug: "coral", qty: 11 }] }, 400, "lebih dari 10"],
    [{ items: [] }, 400, "keranjang kosong"],
    [{ phone: "123" }, 400, "HP salah"],
    [{ address: "jl" }, 400, "alamat pendek"],
    [{ service: "XXX" }, 409, "layanan tak ada"],
    [{ website: "http://spam" }, 400, "honeypot"],
  ];
  for (const [patch, status, label] of cases) {
    const r = await run(require("../api/order"), "POST", { body: Object.assign({}, good, patch) });
    assert.strictEqual(r.status, status, label + " -> " + JSON.stringify(r.json));
  }
  assert.strictEqual((await run(require("../api/order"), "GET")).status, 405);
  console.log("OK: semua tes lulus");
})().catch((e) => { console.error(e); process.exit(1); });
