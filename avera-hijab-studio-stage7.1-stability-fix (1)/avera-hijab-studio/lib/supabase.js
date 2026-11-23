"use strict";

// Klien Supabase minimal lewat REST (PostgREST). Tanpa dependency.
// Hanya dipakai di server. SUPABASE_SERVICE_ROLE_KEY tidak boleh sampai ke browser.

function enabled() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function rest(path, opts) {
  opts = opts || {};
  var url = String(process.env.SUPABASE_URL).replace(/\/$/, "") + "/rest/v1/" + path;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var headers = { apikey: key, "Content-Type": "application/json" };
  // Key lama (service_role, berbentuk JWT) dikirim juga sebagai Bearer.
  // Key baru (sb_secret_...) cukup lewat header apikey.
  if (key.indexOf("eyJ") === 0) headers.Authorization = "Bearer " + key;
  if (opts.prefer) headers.Prefer = opts.prefer;
  if (opts.range) headers.Range = String(opts.range);

  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    var res = await fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* abaikan */ }
    if (!res.ok) {
      var err = new Error("Supabase " + res.status + ": " + (json && (json.message || json.error) || text));
      err.status = res.status;
      err.code = json && json.code;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { enabled: enabled, rest: rest };
