"use strict";

var HttpError = require("./http").HttpError;

// RajaOngkir sekarang berjalan di infrastruktur Komerce.
// Dokumentasi: https://rajaongkir.com/docs/shipping-cost/getting_started/endpoint
function base() {
  return String(process.env.RAJAONGKIR_BASE_URL || "https://rajaongkir.komerce.id/api/v1").replace(/\/$/, "");
}

function shippingEnabled() {
  return !!(process.env.RAJAONGKIR_API_KEY && process.env.RAJAONGKIR_ORIGIN_ID);
}

async function call(path, opts) {
  opts = opts || {};
  var key = process.env.RAJAONGKIR_API_KEY;
  if (!key) throw new HttpError(503, "Cek ongkir belum aktif.");
  var headers = { key: key };
  if (opts.form) headers["Content-Type"] = "application/x-www-form-urlencoded";

  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 9000);
  try {
    var res = await fetch(base() + path, {
      method: opts.form ? "POST" : "GET",
      headers: headers,
      body: opts.form ? new URLSearchParams(opts.form).toString() : undefined,
      signal: ctrl.signal,
    });
    var json = null;
    try { json = await res.json(); } catch (e) { /* abaikan */ }
    var metaCode = json && json.meta && Number(json.meta.code);
    if (!res.ok || (metaCode && metaCode >= 400)) {
      console.error("RajaOngkir error", res.status, json && json.meta);
      throw new HttpError(502, "Layanan cek ongkir sedang bermasalah. Coba lagi atau tanya ongkir lewat WhatsApp.");
    }
    return json || {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error("RajaOngkir fetch gagal", e && e.message);
    throw new HttpError(502, "Layanan cek ongkir tidak merespons. Coba lagi sebentar.");
  } finally {
    clearTimeout(t);
  }
}

// Cari kota / kecamatan / kelurahan / kode pos.
async function searchDestinations(q, limit) {
  var json = await call("/destination/domestic-destination?search=" + encodeURIComponent(q) + "&limit=" + (limit || 8) + "&offset=0");
  var rows = Array.isArray(json.data) ? json.data : [];
  return rows.map(function (r) {
    return { id: Number(r.id), label: String(r.label || [r.subdistrict_name, r.district_name, r.city_name, r.province_name, r.zip_code].filter(Boolean).join(", ")) };
  }).filter(function (r) { return r.id > 0 && r.label; });
}

function normalize(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (x) {
    return {
      courier_code: String(x.code || "").toLowerCase(),
      courier_name: String(x.name || x.code || ""),
      service: String(x.service || ""),
      description: String(x.description || ""),
      cost: Math.round(Number(x.cost)),
      etd: String(x.etd || "").trim(),
    };
  }).filter(function (o) { return o.courier_code && o.service && Number.isFinite(o.cost) && o.cost > 0; });
}

async function requestCost(origin, destination, weight, courierParam) {
  var json = await call("/calculate/domestic-cost", {
    form: { origin: String(origin), destination: String(destination), weight: String(weight), courier: courierParam },
  });
  return normalize(json.data);
}

// Hitung ongkir untuk beberapa kurir. Mencoba satu request gabungan ("jne:jnt:..."),
// lalu per kurir jika hasilnya kosong.
async function calculateCost(opts) {
  var origin = process.env.RAJAONGKIR_ORIGIN_ID;
  if (!origin) throw new HttpError(503, "Cek ongkir belum aktif.");
  var couriers = opts.couriers;
  var options = [];
  try {
    options = await requestCost(origin, opts.destination, opts.weight, couriers.join(":"));
  } catch (e) {
    if (couriers.length === 1) throw e;
  }
  if (!options.length && couriers.length > 1) {
    var results = await Promise.allSettled(couriers.map(function (c) {
      return requestCost(origin, opts.destination, opts.weight, c);
    }));
    results.forEach(function (r) { if (r.status === "fulfilled") options = options.concat(r.value); });
  }
  var seen = {};
  options = options.filter(function (o) {
    var k = o.courier_code + "|" + o.service;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  options.sort(function (a, b) { return a.cost - b.cost; });
  return options;
}

module.exports = { shippingEnabled: shippingEnabled, searchDestinations: searchDestinations, calculateCost: calculateCost };
