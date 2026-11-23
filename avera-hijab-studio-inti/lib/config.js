"use strict";

function int(v, d) {
  var n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}

module.exports = {
  PRODUCT: {
    slug: "pashmina-avera",
    name: "Pashmina Avera",
    price: 59000,          // harga jual (Rp)
    compare_price: 65000,  // harga coret (Rp)
    // Berat per pcs untuk hitung ongkir (gram). Asumsi 200 g sampai ditimbang dengan packaging asli.
    weight_gram: int(process.env.WEIGHT_PER_PCS_GRAM, 200),
  },
  MAX_QTY_PER_COLOR: 10,
  MAX_QTY_TOTAL: 50,
  // Kode kurir RajaOngkir dipisah titik dua. Ubah lewat env SHIPPING_COURIERS jika perlu.
  COURIERS: String(process.env.SHIPPING_COURIERS || "jne:sicepat:jnt:anteraja:tiki:pos:ninja")
    .split(":")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean),
  WHATSAPP: String(process.env.WHATSAPP_NUMBER || "6285181938959").replace(/\D/g, ""),
};
