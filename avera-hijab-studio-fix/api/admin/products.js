"use strict";
var h=require("../../lib/http"), sb=require("../../lib/supabase"), auth=require("../../lib/admin-auth");
function clean(v){return String(v||"").trim()}
module.exports=h.handler(["GET","POST","PATCH","DELETE"],async function(req,res){
  var session=await auth.requireAdmin(req,req.method==="GET"?["owner","admin","staff"]:["owner","admin"]);
  if(req.method==="GET"){
    var products=await sb.rest("products?select=*&order=sort.asc,created_at.desc");
    var variants=await sb.rest("product_variants?select=*&order=sort.asc,created_at.asc");
    return h.send(res,200,{products:products||[],variants:variants||[]},{"Cache-Control":"no-store"});
  }
  var b=req.body||{};
  if(req.method==="POST"){
    var name=clean(b.name),slug=clean(b.slug).toLowerCase();
    if(!name||!slug||!Number.isSafeInteger(Number(b.price))||Number(b.price)<0) throw new h.HttpError(400,"Nama, slug, dan harga valid wajib diisi.");
    var payload={name:name,slug:slug,description:clean(b.description)||null,price:Number(b.price),compare_price:b.compare_price===""||b.compare_price==null?null:Number(b.compare_price),cost_price:b.cost_price===""||b.cost_price==null?null:Number(b.cost_price),weight_gram:Number(b.weight_gram||200),image:clean(b.image)||null,active:b.active!==false,sort:Number(b.sort||0)};
    var created=await sb.rest("products",{method:"POST",body:payload,prefer:"return=representation"});
    return h.send(res,201,{product:created&&created[0]});
  }
  if(req.method==="PATCH"){
    if(!b.id) throw new h.HttpError(400,"ID produk wajib diisi.");
    var patch={}; ["name","slug","description","price","compare_price","cost_price","weight_gram","image","active","featured","sort"].forEach(k=>{if(Object.prototype.hasOwnProperty.call(b,k))patch[k]=b[k]});
    if(!Object.keys(patch).length) throw new h.HttpError(400,"Tidak ada perubahan.");
    var updated=await sb.rest("products?id=eq."+encodeURIComponent(b.id),{method:"PATCH",body:patch,prefer:"return=representation"});
    return h.send(res,200,{product:updated&&updated[0]||null});
  }
  if(!b.id) throw new h.HttpError(400,"ID produk wajib diisi.");
  // Soft-delete: menjaga snapshot transaksi dan relasi historis tetap utuh.
  var gone=await sb.rest("products?id=eq."+encodeURIComponent(b.id),{method:"PATCH",body:{active:false},prefer:"return=representation"});
  return h.send(res,200,{product:gone&&gone[0]||null,message:"Produk dinonaktifkan; riwayat transaksi tetap aman."});
});
