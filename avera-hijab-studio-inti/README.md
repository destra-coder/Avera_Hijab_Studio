# Avera Hijab Studio: website katalog + pesanan

Website katalog pashmina (12 warna) dengan:
- **Vercel**: hosting halaman statis + serverless API (`/api/*`)
- **Supabase**: database stok warna dan pesanan
- **RajaOngkir** (Komerce API): cari kota/kecamatan dan hitung ongkir otomatis
- **WhatsApp**: setelah pesanan tersimpan, pembeli diarahkan ke WhatsApp dengan pesan otomatis berisi kode pesanan

Harga: **Rp59.000** (coret Rp65.000). Ubah di `lib/config.js` (`price`, `compare_price`) dan `FALLBACK` di `public/index.html`.

## Struktur

```
public/index.html        halaman web (satu file) + public/img/colors/*.jpg (foto 12 warna)
api/catalog.js           GET  /api/catalog       produk, warna, stok
api/destinations.js      GET  /api/destinations  cari kota/kecamatan (RajaOngkir)
api/shipping.js          POST /api/shipping      hitung ongkir (RajaOngkir)
api/order.js             POST /api/order         validasi, simpan ke Supabase, buat link WhatsApp
lib/                     config, klien Supabase, klien RajaOngkir, helper
supabase/schema.sql      tabel katalog, varian, pesanan, snapshot item, RPC checkout atomik
tests/smoke.js           tes API tanpa jaringan (npm test)
scripts/dev.js           server lokal tanpa dependency (npm run dev)
```

## Langkah 1: Supabase

1. Buat project di https://supabase.com.
2. Buka **SQL Editor > New query**, tempel isi `supabase/schema.sql`, klik **Run**.
3. Buka **Project Settings > API**. Catat:
   - **Project URL** -> `SUPABASE_URL`
   - **service_role** (atau *secret*) key -> `SUPABASE_SERVICE_ROLE_KEY`
   Key ini rahasia, hanya dipakai di server Vercel. Jangan ditaruh di `index.html` atau di-commit.

Tabel dikunci dengan RLS tanpa policy, jadi key publik (anon) tidak bisa membaca/menulis. Semua akses lewat server.

Mengelola data: **Table Editor**.
- `colors.stock`: isi jumlah stok. Kosong (NULL) = belum dihitung, website tidak membatasi dan stok dikonfirmasi lewat chat. Angka 0 = tampil "Habis".
- `colors.active = false`: sembunyikan warna dari website.
- `orders.status`: ubah manual (baru, menunggu_pembayaran, dibayar, dikirim, selesai, batal).
Stok varian berkurang otomatis ketika checkout online berhasil tersimpan. Stok di `product_variants` menjadi sumber stok aktif per produk/varian. `NULL` berarti stok tidak dilacak. Checkout memakai RPC `avera_create_order_atomic` agar insert order, snapshot item, dan pengurangan stok berlangsung dalam satu transaksi. Perubahan status pesanan dan pembatalan harus melalui endpoint admin agar timestamp dan pengembalian stok diproses secara atomik.

**Penting:** jalankan schema SQL terbaru pada Supabase agar function RPC checkout atomik ikut dibuat. Pesanan yang belum memilih layanan ongkir dapat tetap disimpan dan ongkir dikonfirmasi manual via WhatsApp.

## Langkah 2: RajaOngkir

1. Daftar di https://rajaongkir.com, ambil **API key** dari dashboard -> `RAJAONGKIR_API_KEY`.
2. **ID asal** (`RAJAONGKIR_ORIGIN_ID`) = ID kota/kecamatan tempat paket dikirim. Cara cari: setelah deploy (atau `npm run dev`), buka
   `https://DOMAIN-KAMU/api/destinations?search=NAMA-KECAMATAN-GUDANG`
   lalu salin `id` yang labelnya cocok.
3. Berat per pcs: default **200 g** (asumsi). Timbang pashmina + packaging asli, lalu set `WEIGHT_PER_PCS_GRAM`.
4. Kurir yang dicek diatur `SHIPPING_COURIERS` (default `jne:sicepat:jnt:anteraja:tiki:pos:ninja`). Kurir yang tidak ada di paket RajaOngkir-mu akan kosong; sesuaikan daftarnya.

## Langkah 3: GitHub

```bash
unzip avera-hijab-studio.zip && cd avera-hijab-studio
git init && git add . && git commit -m "Avera Hijab Studio"
git branch -M main
git remote add origin https://github.com/USERNAME/avera-hijab-studio.git
git push -u origin main
```
(`.env*` sudah masuk `.gitignore`.)

## Langkah 4: Vercel

1. https://vercel.com > **Add New > Project** > import repo GitHub tadi.
2. Framework Preset: **Other**. Biarkan Build Command kosong (Output Directory sudah diatur di `vercel.json` ke `public`).
3. **Settings > Environment Variables**, isi:
   | Nama | Wajib |
   |---|---|
   | `SUPABASE_URL` | ya |
   | `SUPABASE_SERVICE_ROLE_KEY` | ya |
   | `RAJAONGKIR_API_KEY` | ya |
   | `RAJAONGKIR_ORIGIN_ID` | ya |
   | `WEIGHT_PER_PCS_GRAM` | disarankan |
   | `SHIPPING_COURIERS` | opsional |
   | `WHATSAPP_NUMBER` | opsional (default 6285181938959) |
4. **Deploy**. Setelah mengubah env var, lakukan **Redeploy**.

Fitur menyala bertahap: tanpa Supabase, pembeli tetap bisa pesan langsung ke WhatsApp (mode lama, tanpa penyimpanan). Tanpa RajaOngkir, pesanan tersimpan tapi ongkir dihitung manual di chat.

## Uji lokal

```bash
cp .env.example .env.local   # isi nilainya
npm run dev                  # http://localhost:3000
npm test                     # tes API dengan layanan tiruan
```

## Keamanan dan batasan

- Harga, stok, dan ongkir dihitung ulang di server saat pesanan dibuat. Angka dari browser tidak dipercaya.
- Ada honeypot dan pembatas request per IP (best effort, disimpan di memori instance serverless). Untuk perlindungan lebih kuat, tambahkan Vercel WAF / Upstash rate limit.
- Pencarian tujuan di-cache di edge Vercel supaya hemat kuota RajaOngkir.
- Foto warna: `public/img/colors/<slug>.jpg`. Titik warna (hex) hanya perkiraan untuk tampilan.


## Development progress — multi-product catalog integration

- `supabase/schema.sql` synchronized to the latest schema supplied for this project.
- `lib/products.js` reads active products and active variants from Supabase.
- `api/catalog.js` now returns a `products` array and keeps legacy `product` / `colors` fields temporarily for compatibility with the existing storefront.
- `api/order.js` supports multiple product/variant lines and snapshots price, cost, SKU, and product names.
- `avera_create_order_atomic` creates order + line items and deducts finite variant stock transactionally.
- Storefront checkout supports multi-product orders. Ongkir dihitung memakai berat tiap produk dikalikan kuantitas; bila API/kurir gagal, pelanggan dapat memilih konfirmasi ongkir manual melalui WhatsApp.

Apply the SQL update to Supabase before deploying the updated checkout API; do not deploy checkout code without the RPC function installed. This update has not executed SQL against your Supabase project.


## Admin Dashboard (Stage 4)

Dashboard admin tersedia di `/admin/`. Gunakan akun Supabase Auth yang telah ditambahkan ke tabel `public.admin_users`. Tambahkan environment variable Vercel `SUPABASE_ANON_KEY` (anon/publishable key; aman untuk browser karena akses dibatasi RLS). Jangan pernah memasukkan service-role key ke browser.

Fitur saat ini: login, validasi membership admin aktif, ringkasan order/omzet penjualan (tanpa ongkir), daftar order, pengelolaan status dan informasi pengiriman melalui API server untuk role owner/admin, invoice, laporan, serta tampilan produk/varian/stok. Pembatalan order memulihkan stok varian terlacak melalui prosedur SQL atomik dan mencatat inventory movement. Status pesanan tidak dapat dibuka kembali setelah dibatalkan.

**Catatan akses:** tabel `admin_users` dan policy RLS di schema harus sudah terpasang. Akun Auth harus memiliki baris `admin_users` dengan `active=true`.


## Inventory & Product Management (Stage 5)

Dashboard `/admin/` now supports creating products and variants, editing product name/price, safe deactivation (soft delete), stock-in, stock-out, stock adjustment, and viewing the latest inventory movement ledger. Stock changes are performed by the `avera_adjust_stock` PostgreSQL function with row locking; negative stock is rejected. `NULL` stock remains "not tracked" and cannot be adjusted until a numeric stock is set.

New server endpoints (all require a valid Supabase Auth bearer session and an active `admin_users` record):
- `GET/POST/PATCH/DELETE /api/admin/products` (writes: owner/admin; delete is soft deactivate)
- `POST/PATCH/DELETE /api/admin/variants` (owner/admin; delete is soft deactivate)
- `GET/POST /api/admin/stock` (read: active admin; write: owner/admin)

Run the updated full `supabase/schema.sql` in Supabase SQL Editor before deploying this stage. It creates `inventory_movements` and `avera_adjust_stock`. The service-role key remains server-only. Do not expose it in browser code.

## Stage 6 — Laporan keuangan & profit

Dashboard `/admin/` kini memiliki tab **Laporan** dengan filter tanggal dan export CSV.
Endpoint `GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` hanya dapat diakses anggota admin aktif.

Definisi laporan:
- Omzet bersih = subtotal pesanan berstatus `dibayar`, `dikirim`, atau `selesai`, dikurangi diskon. Ongkir tidak dihitung sebagai penjualan.
- HPP = penjumlahan snapshot `order_items.line_cost` untuk item yang HPP-nya diketahui.
- Laba kotor dan margin hanya ditampilkan jika seluruh item terjual pada periode itu memiliki snapshot HPP. Jika masih ada HPP kosong, dashboard menandai hasil belum lengkap dan tidak mengarang laba.
- Nilai persediaan = stok varian aktif dikali `products.cost_price` saat ini, hanya untuk produk yang HPP-nya terisi. Unit stok yang HPP-nya belum diketahui ditampilkan terpisah.
- Produk terlaris dirangking berdasarkan jumlah unit. Penjualan per produk ditampilkan sebelum alokasi diskon order.

HPP produk dapat diisi atau diperbarui dari menu **Produk & stok**. Perubahan HPP produk berlaku untuk checkout baru; snapshot transaksi lama tidak berubah. Untuk transaksi lama yang dibuat sebelum HPP diisi, laporan akan tetap menunjukkan HPP belum lengkap.

Tidak ada migrasi SQL baru untuk Stage 6; laporan memakai tabel `orders`, `order_items`, `products`, dan `product_variants` yang sudah ada pada schema Stage 5.

## Invoice pesanan (admin)

Pada tab **Pesanan**, klik **Cetak invoice** di baris pesanan. Invoice dibuka pada tab baru dan dapat dicetak atau disimpan sebagai PDF melalui dialog cetak browser. Invoice menggunakan snapshot item dan harga yang tersimpan pada pesanan, menampilkan rincian pelanggan, kurir/ongkir, diskon (jika ada), total, status, serta nomor resi jika sudah diisi. Invoice ini adalah dokumen rincian/tagihan pesanan, bukan faktur pajak.

Untuk alur operasional Avera yang masih memproses konfirmasi pembayaran dan pengiriman melalui WhatsApp, admin dapat mengirim PDF invoice kepada pelanggan setelah mencetak/menyimpannya. Jika ongkir belum tersedia pada saat order dibuat, invoice menandainya sebagai **konfirmasi admin**, bukan Rp0.


## Stage 7.1 — System Audit & Stability Fix

Untuk project Supabase yang sudah menjalankan schema Stage 1–7, jalankan **hanya** file `supabase/migrations/20261123_stage71_order_stability.sql` melalui SQL Editor. Jangan menjalankan ulang schema lama secara membabi buta pada database produksi.

Untuk project baru, `supabase/schema.sql` sudah mencakup fungsi migrasi Stage 7.1. Pastikan SQL berhasil tanpa error sebelum deploy source code ini.

Perbaikan Stage 7.1:
- Pembatalan pesanan mengembalikan stok finite satu kali dan membuat catatan inventory movement.
- Transisi status pesanan divalidasi di backend/SQL; timestamp `paid_at`, `shipped_at`, `completed_at`, dan `cancelled_at` diisi saat status berubah.
- Status `dikirim` memerlukan kurir dan nomor resi. Status yang sudah `dikirim` tidak bisa dibatalkan dari dashboard.
- Browser tidak lagi mendapat hak tulis langsung ke `orders` dan `order_items`; perubahan pesanan dilakukan melalui endpoint server yang memverifikasi role Owner/Admin.
- Admin dapat menyimpan kurir, layanan, ongkir, estimasi, dan nomor resi di dashboard. Total pesanan dihitung ulang sebagai subtotal - diskon + ongkir.
- Cek ongkir menggunakan berat aktual masing-masing produk dikalikan kuantitas. Jika RajaOngkir gagal/kuota habis, pelanggan dapat memilih konfirmasi ongkir manual via WhatsApp.
- Laporan penjualan memakai tanggal pembayaran (`paid_at`) dalam zona waktu WIB; data transaksi lama tanpa `paid_at` memakai tanggal pembuatan sebagai fallback. HPP kosong tetap tidak dihitung sebagai nol.
- Pengambilan data laporan menggunakan pagination agar tidak berhenti diam-diam pada batas default PostgREST.

Setelah migration berhasil:
1. Deploy source code Stage 7.1.
2. Login sebagai Owner/Admin dan uji perubahan status serta input resi.
3. Buat pesanan uji dengan stok finite, batalkan, lalu pastikan stok kembali satu kali dan riwayat stok bertambah.
4. Uji cek ongkir untuk satu dan beberapa produk dengan berat berbeda.
5. Uji laporan dengan transaksi yang mempunyai `paid_at` dan transaksi lama yang `paid_at`-nya masih kosong.

Tes otomatis lokal memakai mock Supabase/RajaOngkir. Tes tersebut tidak menjalankan SQL pada project Supabase Avera dan tidak membuktikan konfigurasi production sudah diterapkan.
