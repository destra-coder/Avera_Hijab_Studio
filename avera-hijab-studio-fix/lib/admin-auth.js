"use strict";
var sb=require("./supabase"), HttpError=require("./http").HttpError;
async function requireAdmin(req,roles){
  var auth=String(req.headers.authorization||"");
  if(!/^Bearer\s+\S+/i.test(auth)) throw new HttpError(401,"Sesi admin tidak ditemukan.");
  var token=auth.replace(/^Bearer\s+/i,"");
  var base=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  var key=process.env.SUPABASE_ANON_KEY||"";
  if(!base||!key||!sb.enabled()) throw new HttpError(503,"Konfigurasi Supabase admin belum lengkap.");
  var r=await fetch(base+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
  if(!r.ok) throw new HttpError(401,"Sesi login tidak valid atau sudah kedaluwarsa.");
  var user=await r.json();
  var rows=await sb.rest("admin_users?select=user_id,full_name,role,active&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
  var profile=rows&&rows[0];
  if(!profile||!profile.active) throw new HttpError(403,"Akun tidak memiliki akses admin aktif.");
  if(roles&&roles.length&&!roles.includes(profile.role)) throw new HttpError(403,"Role tidak diizinkan untuk tindakan ini.");
  return {user:user,profile:profile};
}
module.exports={requireAdmin:requireAdmin};
