# rekapQ — Order Manager PRO+

Aplikasi web ringan untuk mencatat order, membaca deadline otomatis dari teks bahasa Indonesia, dan memantau status pekerjaan. Data disimpan di browser (localStorage).

## Struktur
- `index.html` — semua halaman (Beranda, Aplikasi, Panduan, FAQ, Tentang, Privasi, Syarat, Kontak)
- `style.css` — tema gelap/terang, layout desktop-first
- `js/parser.js` — pembaca tanggal & jam dari teks bebas
- `js/app.js` — logika aplikasi (order, status, urutan, undo, tema)
- `robots.txt`, `sitemap.xml` — SEO

## Pintasan
- `Ctrl + Enter` di kotak order → tambah order
- `/` → fokus ke pencarian
