"use strict";
var h=require("../lib/http");
module.exports=h.handler(["GET"],async function(req,res){
  var url=process.env.SUPABASE_URL||"",key=process.env.SUPABASE_ANON_KEY||"";
  if(!url||!key)throw new h.HttpError(503,"Admin belum dikonfigurasi. Tambahkan SUPABASE_URL dan SUPABASE_ANON_KEY di environment Vercel.");
  h.send(res,200,{url:url,anonKey:key},{"Cache-Control":"no-store"});
});
