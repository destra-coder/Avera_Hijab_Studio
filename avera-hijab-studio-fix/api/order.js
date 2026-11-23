"use strict";
var crypto = require("crypto");
var h = require("../lib/http");
var cfg = require("../lib/config");
var sb = require("../lib/supabase");
var ro = require("../lib/rajaongkir");
var productsLib = require("../lib/products");

function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max); }
function normPhone(s) { var d=String(s||"").replace(/\D/g,""); if(d.indexOf("0")===0)d="62"+d.slice(1); else if(d.indexOf("8")===0)d="62"+d; return /^62\d{8,13}$/.test(d)?d:null; }
function rp(n){return "Rp"+String(n).replace(/\B(?=(\d{3})+(?!\d))/g,".");}
function newCode(){var wib=new Date(Date.now()+7*3600*1000),y=String(wib.getUTCFullYear()).slice(2),m=String(wib.getUTCMonth()+1).padStart(2,"0"),d=String(wib.getUTCDate()).padStart(2,"0");return "AVR-"+y+m+d+"-"+crypto.randomBytes(3).toString("hex").toUpperCase();}
function buildMessage(o){var L=["Halo Avera Hijab Studio, saya sudah buat pesanan di website.","","Kode pesanan: "+o.code,""];o.items.forEach(function(it,i){L.push((i+1)+". "+it.product_name+(it.variant_name?" - "+it.variant_name:"")+" x"+it.qty+" = "+rp(it.qty*it.unit_price));});L.push("","Total: "+o.totalQty+" pcs","Subtotal: "+rp(o.subtotal));if(o.shipping)L.push("Ongkir: "+rp(o.shipping.cost)+" ("+o.shipping.label+(o.shipping.etd?", estimasi "+o.shipping.etd:"")+")","Total bayar: "+rp(o.total));else L.push("Ongkir: mohon dihitungkan di chat");L.push("","Nama: "+o.name,"No. HP: "+o.phone);if(o.destination)L.push("Tujuan: "+o.destination);L.push("Alamat lengkap: "+o.address);if(o.note)L.push("Catatan: "+o.note);L.push("","Pembayaran lewat transfer, mohon info rekeningnya ya.","Mohon dicek ketersediaan pesanan. Terima kasih!");return L.join("\n");}

module.exports = h.handler(["POST"], async function(req,res){
 h.rateLimit(req,"order",8,10*60*1000); if(!sb.enabled())throw new h.HttpError(503,"Pemesanan online belum aktif. Silakan pesan lewat WhatsApp.");
 var b=await h.readBody(req); if(clean(b.website,50))throw new h.HttpError(400,"Permintaan ditolak.");
 var name=clean(b.name,60),phone=normPhone(b.phone),address=clean(b.address,300),note=clean(b.note,120);
 if(name.length<2)throw new h.HttpError(400,"Isi nama penerima.");if(!phone)throw new h.HttpError(400,"Nomor HP/WhatsApp tidak valid. Contoh: 081234567890.");if(address.length<10)throw new h.HttpError(400,"Isi alamat lengkap (jalan, nomor, RT/RW, patokan).");
 var raw=Array.isArray(b.items)?b.items.slice(0,40):[],merged={}; raw.forEach(function(it){var ps=clean(it&&it.product_slug,50),vs=clean(it&&it.variant_slug||it&&it.slug,50),q=parseInt(it&&it.qty,10);if(/^[a-z0-9-]+$/.test(ps)&&/^[a-z0-9-]+$/.test(vs)&&q>0){var k=ps+"|"+vs;merged[k]=(merged[k]||0)+q;}});
 var keys=Object.keys(merged);if(!keys.length)throw new h.HttpError(400,"Keranjang kosong.");
 var catalog=await productsLib.getProducts(),items=[],totalQty=0,totalWeight=0,subtotal=0;
 keys.forEach(function(k){var parts=k.split("|"),p=catalog.products.find(function(x){return x.slug===parts[0]&&x.active;}),v=p&&p.variants.find(function(x){return x.slug===parts[1]&&x.active;});if(!p||!v)throw new h.HttpError(409,"Produk atau varian tidak tersedia. Muat ulang katalog.");var q=merged[k];if(q>cfg.MAX_QTY_PER_COLOR)throw new h.HttpError(400,"Maksimal "+cfg.MAX_QTY_PER_COLOR+" pcs per varian.");if(v.stock!==null&&v.stock<q)throw new h.HttpError(409,v.stock<=0?"Varian "+v.name+" sedang habis.":"Stok "+v.name+" tersisa "+v.stock+" pcs.");if(!p.id||!v.id)throw new h.HttpError(503,"Checkout online belum siap untuk produk ini. Silakan pesan lewat WhatsApp.");items.push({product_id:p.id,variant_id:v.id,product_slug:p.slug,variant_slug:v.slug,product_name:p.name,variant_name:v.name,sku:v.sku||null,qty:q,unit_price:Number(p.price),unit_cost:p.cost_price==null?null:Number(p.cost_price),weight_gram:Number(p.weight_gram||cfg.PRODUCT.weight_gram)});totalQty+=q;totalWeight+=Number(p.weight_gram||cfg.PRODUCT.weight_gram)*q;subtotal+=Number(p.price)*q;});
 if(totalQty>cfg.MAX_QTY_TOTAL)throw new h.HttpError(400,"Jumlah terlalu banyak. Untuk pesanan besar, hubungi kami lewat WhatsApp.");
 var shipping=null,destId=null,destLabel=clean(b.destination_label,200)||null;
 // Ongkir hanya dihitung jika customer memilih layanan. Bila belum memilih, admin mengonfirmasi manual.
 if(ro.shippingEnabled()&&b.destination_id){destId=parseInt(b.destination_id,10);var code=clean(b.courier,20).toLowerCase(),service=clean(b.service,40).toLowerCase();if(!(destId>0))throw new h.HttpError(400,"Pilih kota atau kecamatan tujuan.");if(b.courier&&b.service){var code=clean(b.courier,20).toLowerCase(),service=clean(b.service,40).toLowerCase();var quote=await ro.calculateCost({destination:destId,weight:totalWeight,couriers:[code]});var pick=quote.find(function(o){return o.courier_code===code&&o.service.toLowerCase()===service;});if(!pick)throw new h.HttpError(409,"Opsi pengiriman berubah. Cek ongkir lagi lalu pilih ulang.");shipping={cost:pick.cost,label:pick.courier_name+" "+pick.service,etd:pick.etd,code:pick.courier_code,service:pick.service};}}
 var total=subtotal+(shipping?shipping.cost:0),codeOrder=newCode();
 var rpcPayload={order_code:codeOrder,customer_name:name,customer_phone:phone,address:address,destination_id:destId,destination_label:destLabel,note:note||null,total_qty:totalQty,subtotal:subtotal,courier:shipping?shipping.code:null,courier_service:shipping?shipping.service:null,shipping_cost:shipping?shipping.cost:null,shipping_etd:shipping?shipping.etd:null,total:total,items:items.map(function(it){return{product_id:it.product_id,variant_id:it.variant_id,product_name:it.product_name,variant_name:it.variant_name,sku:it.sku,quantity:it.qty,unit_price:it.unit_price,unit_cost:it.unit_cost};})};
 try{await sb.rest("rpc/avera_create_order_atomic",{method:"POST",body:{p_order:rpcPayload}});}catch(e){console.error("Gagal membuat order atomik:",e.message);if(e.code==="P0001")throw new h.HttpError(409,"Stok berubah saat checkout. Silakan muat ulang katalog dan coba kembali.");throw new h.HttpError(500,"Pesanan belum tersimpan. Coba lagi, atau pesan langsung lewat WhatsApp.");}
 var message=buildMessage({code:codeOrder,items:items,totalQty:totalQty,subtotal:subtotal,shipping:shipping,total:total,name:name,phone:phone,destination:destLabel,address:address,note:note});
 h.send(res,201,{order_code:codeOrder,subtotal:subtotal,shipping_cost:shipping?shipping.cost:null,total:total,whatsapp_url:"https://wa.me/"+cfg.WHATSAPP+"?text="+encodeURIComponent(message)});
});
