"use strict";
const assert=require("assert");
process.env.SUPABASE_URL="https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY="sb_secret_test";
process.env.SUPABASE_ANON_KEY="sb_publishable_test";
let role="owner", rpcArgs=null;
global.fetch=async(url,opts={})=>{
 url=String(url);const ok=(data,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(data),json:async()=>data});
 if(url.includes("/auth/v1/user"))return ok({id:"admin-1"});
 if(url.includes("/rest/v1/admin_users"))return ok([{user_id:"admin-1",role,active:true}]);
 if(url.includes("/rest/v1/rpc/avera_admin_update_order")){rpcArgs=JSON.parse(opts.body);return ok({id:rpcArgs.p_order_id,status:rpcArgs.p_status||"dibayar",tracking_number:rpcArgs.p_tracking_number});}
 throw Error("Unexpected URL "+url);
};
function run(handler,body){return new Promise(resolve=>{const res={headers:{},setHeader(k,v){this.headers[k]=v},end(b){resolve({status:this.statusCode,json:JSON.parse(b),headers:this.headers})}};handler({method:"PATCH",headers:{authorization:"Bearer admin-session"},body,socket:{}},res)})}
(async()=>{
 const api=require("../api/admin/orders");
 let r=await run(api,{id:"11111111-1111-4111-8111-111111111111",action:"status",status:"dibayar"});
 assert.equal(r.status,200);assert.equal(rpcArgs.p_status,"dibayar");assert.equal(rpcArgs.p_actor,"admin-1");
 r=await run(api,{id:"11111111-1111-4111-8111-111111111111",action:"shipping",courier:"jne",courier_service:"REG",shipping_cost:"15000",tracking_number:"JNE123"});
 assert.equal(r.status,200);assert.equal(rpcArgs.p_tracking_number,"JNE123");assert.equal(rpcArgs.p_shipping_cost,15000);
 r=await run(api,{id:"bad",action:"status",status:"dibayar"});assert.equal(r.status,400);
 r=await run(api,{id:"11111111-1111-4111-8111-111111111111",action:"status",status:"unexpected"});assert.equal(r.status,400);
 role="staff";r=await run(api,{id:"11111111-1111-4111-8111-111111111111",action:"status",status:"dibayar"});assert.equal(r.status,403);
 const fs=require("fs"),sql=fs.readFileSync(require("path").join(__dirname,"../supabase/migrations/20261123_stage71_order_stability.sql"),"utf8");
 assert.ok(sql.includes("avera_admin_update_order"));assert.ok(sql.includes("inventory_movements"));assert.ok(sql.includes("revoke insert, update, delete on public.orders from authenticated"));assert.ok(sql.includes("for update"));assert.ok(sql.includes("paid_at=case"));assert.ok(sql.includes("tracking_required"));
 const adminHtml=fs.readFileSync(require("path").join(__dirname,"../public/admin/index.html"),"utf8");assert.ok(!adminHtml.includes("client.from('orders').update"),"status order tidak lagi diubah langsung dari browser");assert.ok(adminHtml.includes("data-save-shipping"));
 console.log("OK: tes stabilisasi Stage 7.1 lulus");
})().catch(e=>{console.error(e);process.exit(1)});
