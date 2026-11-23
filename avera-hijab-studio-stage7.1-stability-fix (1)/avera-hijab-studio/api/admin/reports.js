"use strict";
var h=require("../../lib/http"),sb=require("../../lib/supabase"),auth=require("../../lib/admin-auth");
function validDate(v){if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;var d=new Date(v+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;}
async function fetchAll(path){var out=[],start=0,page;do{page=await sb.rest(path,{range:start+"-"+(start+999)});page=Array.isArray(page)?page:[];out=out.concat(page);start+=page.length;}while(page.length===1000);return out;}
function localDay(value){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));}
module.exports=h.handler(["GET"],async function(req,res){
 await auth.requireAdmin(req,["owner","admin","staff"]);
 var from=String((req.query||{}).from||""),to=String((req.query||{}).to||"");
 if(!validDate(from)||!validDate(to)||from>to)throw new h.HttpError(400,"Rentang tanggal tidak valid.");
 var start=from+"T00:00:00+07:00",finish=new Date(Date.parse(to+"T00:00:00+07:00")+86400000).toISOString();
 var periodFilter="(and(paid_at.gte."+start+",paid_at.lt."+finish+"),and(paid_at.is.null,created_at.gte."+start+",created_at.lt."+finish+"))";
 var paid=await fetchAll("orders?select=id,order_code,status,subtotal,discount_amount,shipping_cost,total,created_at,paid_at&status=in.(dibayar,dikirim,selesai)&or="+encodeURIComponent(periodFilter)+"&order=paid_at.asc.nullslast,created_at.asc");
 paid=(paid||[]).filter(o=>["dibayar","dikirim","selesai"].includes(o.status)&&localDay(o.paid_at||o.created_at)>=from&&localDay(o.paid_at||o.created_at)<=to);
 var ids=paid.map(o=>o.id),items=[];
 if(ids.length){for(var ix=0;ix<ids.length;ix+=100){var inIds="("+ids.slice(ix,ix+100).join(",")+")";var chunk=await fetchAll("order_items?select=order_id,product_id,variant_id,product_name,variant_name,sku,quantity,unit_price,unit_cost,line_total,line_cost,created_at&order_id=in."+encodeURIComponent(inIds));items=items.concat(chunk);}}
 var missing=items.filter(i=>i.unit_cost===null||i.unit_cost===undefined);
 var sales=paid.reduce((n,o)=>n+Math.max(0,Number(o.subtotal||0)-Number(o.discount_amount||0)),0);
 var cogsKnown=items.reduce((n,i)=>n+(i.unit_cost==null?0:Number(i.line_cost||Number(i.quantity)*Number(i.unit_cost))),0);
 var daily={};paid.forEach(o=>{var d=localDay(o.paid_at||o.created_at);daily[d]=(daily[d]||0)+Math.max(0,Number(o.subtotal||0)-Number(o.discount_amount||0));});
 var byProduct={};items.forEach(i=>{var k=i.product_id||i.product_name;var p=byProduct[k]||(byProduct[k]={product_id:i.product_id,name:i.product_name,qty:0,sales:0,cogs_known:0,missing_cost_qty:0});p.qty+=Number(i.quantity);p.sales+=Number(i.line_total||Number(i.quantity)*Number(i.unit_price));if(i.unit_cost==null)p.missing_cost_qty+=Number(i.quantity);else p.cogs_known+=Number(i.line_cost||Number(i.quantity)*Number(i.unit_cost));});
 var products=await fetchAll("products?select=id,name,price,cost_price,active,product_variants(stock,active)&order=name.asc");
 var stockValue=0,unknownStock=0,stockUnits=0,activeProducts=0;
 (products||[]).forEach(p=>{if(p.active)activeProducts++;(p.product_variants||[]).forEach(v=>{if(v.active&&v.stock!=null){stockUnits+=Number(v.stock);if(p.cost_price==null)unknownStock+=Number(v.stock);else stockValue+=Number(v.stock)*Number(p.cost_price);}})});
 var allCostKnown=missing.length===0;
 return h.send(res,200,{period:{from:from,to:to},summary:{order_count:paid.length,paid_order_count:paid.length,sales:sales,cogs:allCostKnown?cogsKnown:null,cogs_known:cogsKnown,profit:allCostKnown?sales-cogsKnown:null,margin:allCostKnown&&sales>0?((sales-cogsKnown)/sales)*100:null,items_count:items.length,missing_cost_lines:missing.length,missing_cost_qty:missing.reduce((n,i)=>n+Number(i.quantity),0)},daily:Object.keys(daily).sort().map(date=>({date,sales:daily[date]})),top_products:Object.values(byProduct).sort((a,b)=>b.qty-a.qty).slice(0,20),inventory:{stock_units:stockUnits,known_cost_value:stockValue,unknown_cost_units:unknownStock,active_products:activeProducts},orders:paid.map(o=>({order_code:o.order_code,status:o.status,created_at:o.created_at,paid_at:o.paid_at,total:o.total,subtotal:o.subtotal,discount_amount:o.discount_amount}))},{"Cache-Control":"no-store"});
});
