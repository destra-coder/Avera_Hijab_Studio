"use strict";

// Daftar warna bawaan. Dipakai sebagai cadangan kalau Supabase belum tersambung,
// dan sebagai sumber hex/foto default. Stok dan status aktif dikelola di tabel Supabase `colors`.
// Kode hex hanya perkiraan untuk titik warna di UI; foto asli ada di /img/colors/.
var COLORS = [
  { slug: "white",         name: "White",         hex: "#f7f6f3", featured: true,  sort: 10 },
  { slug: "moss",          name: "Moss",          hex: "#d6d5cc", featured: false, sort: 20 },
  { slug: "jasmine-white", name: "Jasmine White", hex: "#efe9dc", featured: true,  sort: 30 },
  { slug: "soft-blue",     name: "Soft Blue",     hex: "#b4def3", featured: false, sort: 40 },
  { slug: "nude",          name: "Nude",          hex: "#d7beb4", featured: false, sort: 50 },
  { slug: "tempered-grey", name: "Tempered Grey", hex: "#a9c6ea", featured: true,  sort: 60 },
  { slug: "coral",         name: "Coral",         hex: "#f2b5b8", featured: true,  sort: 70 },
  { slug: "camille-pink",  name: "Camille Pink",  hex: "#f1d8ea", featured: false, sort: 80 },
  { slug: "peach-beige",   name: "Peach Beige",   hex: "#e4d3c8", featured: true,  sort: 90 },
  { slug: "lavender",      name: "Lavender",      hex: "#f4c9df", featured: false, sort: 100 },
  { slug: "latte",         name: "Latte",         hex: "#cea29c", featured: false, sort: 110 },
  { slug: "black",         name: "Black",         hex: "#161323", featured: false, sort: 120 },
].map(function (c) {
  c.image = "/img/colors/" + c.slug + ".jpg";
  return c;
});

module.exports = { COLORS: COLORS };
