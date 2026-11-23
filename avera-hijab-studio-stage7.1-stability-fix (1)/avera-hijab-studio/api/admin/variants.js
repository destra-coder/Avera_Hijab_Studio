"use strict";
var h=require("../../lib/http"),sb=require("../../lib/supabase"),auth=require("../../lib/admin-auth");
function s(v){return String(v||"").trim()}
module.exports=h.handler(["POST","PATCH","DELETE"],async function(req,res){
 await auth.requireAdmin(req,["owner","admin"]);var b=req.body||{};
 if(req.method==="POST"){
  if(!b.product_id||!s(b.slug)||!s(b.name))throw new h.HttpError(400,"Produk, slug, dan nama varian wajib diisi.");
  var row={product_id:b.product_id,slug:s(b.slug).toLowerCase(),name:s(b.name),sku:s(b.sku)||null,color_hex:s(b.color_hex)||null,image:s(b.image)||null,stock:b.stock===""||b.stock==null?null:Number(b.stock),active:b.active!==false,sort:Number(b.sort||0),attributes:b.attributes||{}};
  var out=await sb.rest("product_variants",{method:"POST",body:row,prefer:"return=representation"});return h.send(res,201,{variant:out&&out[0]});
 }
 if(!b.id)throw new h.HttpError(400,"ID varian wajib diisi.");
 if(req.method==="DELETE"){var d=await sb.rest("product_variants?id=eq."+encodeURIComponent(b.id),{method:"PATCH",body:{active:false},prefer:"return=representation"});return h.send(res,200,{variant:d&&d[0]||null,message:"Varian dinonaktifkan."});}
 var patch={};["slug","sku","name","color_hex","image","stock","active","sort","attributes"].forEach(k=>{if(Object.prototype.hasOwnProperty.call(b,k))patch[k]=b[k]});
 var u=await sb.rest("product_variants?id=eq."+encodeURIComponent(b.id),{method:"PATCH",body:patch,prefer:"return=representation"});return h.send(res,200,{variant:u&&u[0]||null});
});
