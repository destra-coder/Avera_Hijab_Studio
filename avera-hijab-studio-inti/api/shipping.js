"use strict";
var h = require("../lib/http");
var cfg = require("../lib/config");
var ro = require("../lib/rajaongkir");
var productsLib = require("../lib/products");

// POST /api/shipping { destination_id, items:[{product_slug,variant_slug,qty}] }
// Legacy qty is retained only for older clients; current storefront sends item lines.
module.exports = h.handler(["POST"], async function (req, res) {
  h.rateLimit(req, "ship", 30, 60 * 1000);
  if (!ro.shippingEnabled()) throw new h.HttpError(503, "Cek ongkir belum aktif.");
  var b = await h.readBody(req);
  var dest = parseInt(b.destination_id, 10);
  if (!(dest > 0)) throw new h.HttpError(400, "Pilih kota atau kecamatan tujuan dulu.");
  var weight = 0;
  if (Array.isArray(b.items) && b.items.length) {
    if (b.items.length > 40) throw new h.HttpError(400, "Terlalu banyak jenis barang dalam keranjang.");
    var catalog = await productsLib.getProducts(), merged = {}, totalQty = 0;
    b.items.forEach(function (it) {
      var ps=String(it&&it.product_slug||"").trim(), vs=String(it&&it.variant_slug||"").trim(), q=Number(it&&it.qty);
      if (!/^[a-z0-9-]+$/.test(ps) || !/^[a-z0-9-]+$/.test(vs) || !Number.isSafeInteger(q) || q<1) throw new h.HttpError(400,"Rincian barang untuk cek ongkir tidak valid.");
      var key=ps+"|"+vs; merged[key]=(merged[key]||0)+q;
    });
    Object.keys(merged).forEach(function(key){
      var parts=key.split("|"),p=catalog.products.find(function(x){return x.slug===parts[0]&&x.active;}),v=p&&p.variants.find(function(x){return x.slug===parts[1]&&x.active;});
      if(!p||!v) throw new h.HttpError(409,"Produk atau varian tidak tersedia. Muat ulang katalog.");
      var q=merged[key]; if(q>cfg.MAX_QTY_PER_COLOR)throw new h.HttpError(400,"Jumlah per varian melebihi batas.");
      if(v.stock!==null&&v.stock<q)throw new h.HttpError(409,"Stok varian "+v.name+" tidak mencukupi.");
      totalQty+=q; weight+=Number(p.weight_gram||cfg.PRODUCT.weight_gram)*q;
    });
    if(totalQty>cfg.MAX_QTY_TOTAL)throw new h.HttpError(400,"Jumlah barang melebihi batas checkout.");
  } else {
    var qty=parseInt(b.qty,10);
    if(!(qty>0&&qty<=cfg.MAX_QTY_TOTAL))throw new h.HttpError(400,"Jumlah barang tidak valid.");
    weight=qty*cfg.PRODUCT.weight_gram;
  }
  weight=Math.max(1,Math.ceil(weight));
  var options=await ro.calculateCost({destination:dest,weight:weight,couriers:cfg.COURIERS});
  if(!options.length)throw new h.HttpError(404,"Belum ada opsi kurir ke tujuan ini. Tanyakan ongkir lewat WhatsApp.");
  h.send(res,200,{weight:weight,options:options});
});
