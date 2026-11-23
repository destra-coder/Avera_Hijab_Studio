"use strict";
var h=require("../../lib/http"),sb=require("../../lib/supabase"),auth=require("../../lib/admin-auth");
module.exports=h.handler(["POST","GET"],async function(req,res){
 var who=await auth.requireAdmin(req,req.method==="GET"?["owner","admin","staff"]:["owner","admin"]);
 if(req.method==="GET"){
  var rows=await sb.rest("inventory_movements?select=*,product_variants(name,sku),products(name)&order=created_at.desc&limit=200");return h.send(res,200,{movements:rows||[]},{"Cache-Control":"no-store"});
 }
 var b=req.body||{},qty=Number(b.quantity);
 if(!b.variant_id||!Number.isSafeInteger(qty)||qty<=0||!["in","out","adjust"].includes(b.type))throw new h.HttpError(400,"Varian, jenis pergerakan, dan jumlah stok harus valid.");
 var result=await sb.rest("rpc/avera_adjust_stock",{method:"POST",body:{p_variant_id:b.variant_id,p_type:b.type,p_quantity:qty,p_note:String(b.note||"").trim()||null,p_actor:who.user.id}});
 return h.send(res,200,{movement:result,message:"Stok berhasil diperbarui."});
});
