"use strict";
var h=require("../../lib/http"),sb=require("../../lib/supabase"),auth=require("../../lib/admin-auth");
function clean(v,max){return String(v==null?"":v).trim().slice(0,max);}
module.exports=h.handler(["PATCH"],async function(req,res){
 var who=await auth.requireAdmin(req,["owner","admin"]),b=await h.readBody(req);
 var id=clean(b.id,64),action=clean(b.action,20);
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new h.HttpError(400,"ID pesanan tidak valid.");
 if(!["status","shipping"].includes(action))throw new h.HttpError(400,"Jenis perubahan pesanan tidak valid.");
 var args={p_order_id:id,p_action:action,p_actor:who.user.id,p_status:clean(b.status,32)||null,
  p_courier:clean(b.courier,30)||null,p_courier_service:clean(b.courier_service,40)||null,
  p_tracking_number:clean(b.tracking_number,100)||null,p_shipping_cost:b.shipping_cost===""||b.shipping_cost==null?null:Number(b.shipping_cost),
  p_shipping_etd:clean(b.shipping_etd,80)||null};
 if(action==="shipping"&&!args.p_courier)throw new h.HttpError(400,"Nama kurir wajib diisi.");
 if(action==="shipping"&&(args.p_shipping_cost===null||!Number.isSafeInteger(args.p_shipping_cost)||args.p_shipping_cost<0))throw new h.HttpError(400,"Ongkir wajib diisi dengan angka rupiah yang valid (gunakan 0 untuk gratis).");
 if(action==="status"&&! ["baru","menunggu_pembayaran","dibayar","dikirim","selesai","batal"].includes(args.p_status))throw new h.HttpError(400,"Status pesanan tidak valid.");
 try{
  var result=await sb.rest("rpc/avera_admin_update_order",{method:"POST",body:args});
  return h.send(res,200,{order:result,message:action==="status"?"Status pesanan berhasil diperbarui.":"Informasi pengiriman berhasil disimpan."},{"Cache-Control":"no-store"});
 }catch(e){
  var msg=String(e.message||"");
  if(e.code==="P0001"||/invalid_transition|tracking_required|cannot_cancel_shipped|order_not_found|invalid_action/.test(msg))throw new h.HttpError(409,msg.includes("tracking_required")?"Isi nomor resi sebelum mengubah status menjadi dikirim.":msg.includes("invalid_transition")?"Perubahan status tidak diizinkan dari status saat ini.":msg.includes("cannot_cancel_shipped")?"Pesanan yang sudah dikirim tidak dapat dibatalkan dari dashboard.":"Perubahan pesanan tidak dapat dilakukan. Muat ulang data dan coba lagi.");
  throw e;
 }
});
