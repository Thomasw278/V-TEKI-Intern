# KarbonLens — Kalkulator Emisi Tertanam Produk (CBAM)

Aplikasi web untuk menghitung **emisi tertanam spesifik (SEE) per ton produk** dari 10 kategori dokumen
operasional perusahaan. Setiap perusahaan punya akun dan data sendiri (multi-tenant).

| Bagian | Teknologi |
| --- | --- |
| Backend API | Python 3.11+ · FastAPI · SQLAlchemy 2 · PyMySQL |
| Database | MySQL 8 (atau MariaDB 10.5+ / XAMPP) |
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · CSS murni, responsif · animasi CSS/SVG tanpa pustaka tambahan |
| Tipografi | Gloock (judul) · Instrument Sans (antarmuka) · JetBrains Mono (rumus), di-host sendiri di `frontend/public/fonts` (lisensi OFL) |
| Pembacaan dokumen | Mesin tata letak sendiri: pdfplumber (posisi kata PDF), Tesseract OCR + pelurusan halaman (scan/foto), openpyxl (Excel), CSV, DOCX, TXT |

## Struktur folder

```
karbonlens/
├── backend/
│   ├── app/
│   │   ├── core/            ← logika inti murni Python (bisa diuji tanpa database)
│   │   │   ├── catalog.py      10 jenis dokumen, field, faktor emisi bawaan
│   │   │   ├── layout.py       peta posisi setiap kata per halaman (PDF, Excel, CSV, DOCX, teks)
│   │   │   ├── ocr.py          OCR scan/foto: putar & luruskan halaman, bersihkan citra, Tesseract
│   │   │   ├── rules.py        label, sinonim, satuan, dan rentang wajar untuk setiap field
│   │   │   ├── extraction.py   klasifikasi dokumen + pencarian angka di kanan/bawah/atas/tabel
│   │   │   ├── aggregation.py  field dokumen → data aktivitas baku
│   │   │   ├── engine.py       rumus emisi, alokasi, SEE (Decimal)
│   │   │   ├── validation.py   aturan validasi & kebutuhan dokumen
│   │   │   └── demo_data.py    dokumen contoh untuk data demo
│   │   ├── demo_files/      PDF/XLSX contoh dengan tata letak beragam
│   │   ├── routers/         ← endpoint API (auth, company, documents, periods, factors)
│   │   ├── services/        ← penghubung database ↔ logika inti, ekspor laporan
│   │   ├── models.py        ← tabel MySQL
│   │   ├── schemas.py       ← validasi request/response
│   │   ├── main.py          ← aplikasi FastAPI
│   │   └── seed.py          ← buat tabel + data demo
│   ├── tests/               ← unit test, uji tata letak & OCR (tests/fixtures), uji alur API
│   ├── requirements.txt
│   ├── setup_mysql.sql
│   └── .env.example
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx        halaman depan perusahaan + film pembuka (intro)
│       │   ├── login/          halaman masuk (email perusahaan + kata sandi)
│       │   ├── register/       wizard daftar perusahaan (4 langkah)
│       │   └── (app)/          halaman setelah login
│       │       ├── dashboard/  dokumen/  dokumen/[id]/  validasi/  data/
│       │       └── kalkulasi/  faktor/   laporan/       pengaturan/
│       ├── components/
│       │   ├── Intro.tsx       film pembuka ±6,6 detik (sekali per sesi, bisa dilewati)
│       │   ├── DocDemo.tsx     demo pembacaan dokumen di hero
│       │   ├── Ways.tsx        peragaan cara angka ditemukan
│       │   ├── DocViewer.tsx   penampil halaman dengan kotak sumber, zoom, kandidat lain
│       │   ├── charts.tsx      diagram aliran emisi, waterfall, batang bulanan
│       │   └── AppShell.tsx    sidebar, topbar, palet perintah Ctrl+K, menu ponsel
│       └── lib/             api.ts, session.tsx, summary.tsx, format.ts, types.ts
├── contoh-dokumen/          21 berkas contoh untuk dicoba diunggah
└── docker-compose.yml
```

---

## 1. Prasyarat

Pasang dulu di laptop:

- **Python 3.11 atau lebih baru** — cek dengan `python --version`
- **Node.js 20 atau lebih baru** — cek dengan `node --version`
- **MySQL 8**. Bisa juga memakai MySQL/MariaDB bawaan **XAMPP** atau **Laragon**.
- **Tesseract OCR** untuk membaca dokumen hasil scan dan foto. Tanpa Tesseract aplikasi tetap berjalan,
  tetapi angka pada dokumen scan harus diisi manual.

### Memasang Tesseract

| Sistem | Cara |
| --- | --- |
| Windows | Unduh pemasang dari https://github.com/UB-Mannheim/tesseract/wiki. Saat memasang, centang **Additional language data → Indonesian**. Lokasi bawaan `C:\Program Files\Tesseract-OCR\tesseract.exe` dikenali otomatis; bila dipasang di tempat lain, isi `TESSERACT_CMD` di `backend/.env`. |
| Ubuntu / Debian | `sudo apt install tesseract-ocr tesseract-ocr-ind tesseract-ocr-eng` |
| macOS | `brew install tesseract tesseract-lang` |
| Docker | Sudah termasuk di `backend/Dockerfile`. |

Cek dengan `tesseract --list-langs`; harus ada `ind` dan `eng`.

## 2. Siapkan database MySQL

Buka phpMyAdmin (tab SQL) atau terminal MySQL, lalu jalankan isi `backend/setup_mysql.sql`:

```sql
CREATE DATABASE IF NOT EXISTS karbonlens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'karbon'@'localhost' IDENTIFIED BY 'karbon123';
GRANT ALL PRIVILEGES ON karbonlens.* TO 'karbon'@'localhost';
FLUSH PRIVILEGES;
```

> Pakai XAMPP dengan user `root` tanpa kata sandi? Cukup buat database `karbonlens`, lalu pada langkah 3
> isi `DATABASE_URL=mysql+pymysql://root:@localhost:3306/karbonlens?charset=utf8mb4`.

Tabel **tidak perlu dibuat manual**. Aplikasi membuatnya otomatis.

## 3. Jalankan backend (FastAPI)

```bash
cd backend

# buat virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

# konfigurasi
copy .env.example .env        # Windows
cp .env.example .env          # macOS / Linux
# lalu buka .env dan sesuaikan DATABASE_URL & JWT_SECRET

# buat tabel + katalog 10 dokumen + data demo (opsional)
python -m app.seed --demo

# jalankan server
uvicorn app.main:app --reload --port 8000
```

Cek di browser:

- http://localhost:8000/api/health → `{"status":"ok"}`
- http://localhost:8000/docs → dokumentasi API interaktif (Swagger), semua endpoint bisa dicoba di sini

### Uji otomatis backend

```bash
pytest -q
```

Isi pengujian:

- Mesin hitung, ekstraksi, agregasi, dan aturan validasi.
- **Mesin tata letak & OCR** (`test_layout.py`): angka di kanan, bawah, atas, tabel dua halaman, formulir kotak,
  matriks, Excel, CSV, DOCX, scan diputar 90°, dan foto miring. Uji OCR otomatis dilewati bila Tesseract belum terpasang.
- **Alur API lengkap** memakai SQLite sementara (tidak menyentuh MySQL Anda): daftar → unggah 21 dokumen → validasi →
  setujui faktor → hitung → kunci → ekspor.
- Isolasi data antarperusahaan.

Hasil yang diharapkan: SEE CPO = **1,006** dan PKO = **1,594** t CO₂e/t.

## 4. Jalankan frontend (Next.js)

Buka terminal baru:

```bash
cd frontend
npm install
copy .env.example .env.local     # Windows  (cp untuk macOS/Linux)
npm run dev
```

Buka **http://localhost:3000**. Halaman depan memutar film pembuka sekitar 6 detik (sekali per sesi browser,
bisa dilewati dengan klik atau tombol Esc), lalu menampilkan profil aplikasi. Tombol **Masuk** dan
**Daftarkan perusahaan** ada di kanan atas.

Halaman aplikasi juga mendukung **Ctrl+K** (⌘K di Mac) untuk mencari dokumen atau membuka halaman dengan cepat.

## 5. Coba aplikasinya

Jika menjalankan `python -m app.seed --demo`, tersedia akun berikut (kata sandi semua: `Demo12345`):

| Email | Peran | Untuk mencoba |
| --- | --- | --- |
| admin@demo.id | Admin | profil perusahaan, fasilitas, produk, tambah akun |
| operator@demo.id | Operator | unggah & validasi dokumen, jalankan kalkulasi |
| reviewer@demo.id | Reviewer | setujui faktor emisi, setujui dokumen, kunci periode |

Skenario uji lengkap:

1. Masuk sebagai **reviewer@demo.id**.
2. Buka menu **Faktor emisi**, lalu klik **Setujui** pada semua faktor draf.
3. Buka **Kalkulasi**, lalu klik **Hitung ulang**. SEE CPO harus 1,006.
4. Buka **Tinjauan & laporan**. Kelima syarat harus hijau.
5. Klik **Setujui & kunci periode**, lalu unduh XLSX dan XML.

Untuk mencoba dari nol:

1. Klik **Daftarkan perusahaan baru** di halaman login.
2. Isi wizard 4 langkah: profil & alamat, fasilitas & produk, parameter perhitungan, akun admin.
3. Unggah berkas dari folder `contoh-dokumen/`. Subfolder `format-beragam/` berisi dokumen dengan tata letak sulit:
   - scan yang diputar,
   - foto miring,
   - tabel dua halaman,
   - formulir kotak,
   - Excel, CSV titik koma, dan Word.

   Buka dokumen hasil unggahan untuk melihat kotak sumber setiap angka.

## 6. Alur & logika singkat

1. **Unggah**: berkas disimpan di `backend/storage/<perusahaan>/<periode>/`. Duplikat persis (hash SHA-256) ditolak.
2. **Klasifikasi & ekstraksi** (background):
   - Sistem membaca teks dokumen, lalu menebak 1 dari 10 kategori berdasarkan kata kunci.
   - Field diambil dengan pola teks.
   - Setiap field menyimpan nilai, satuan, skor keyakinan, dan kutipan teks sumbernya.
3. **Validasi**:
   - Operator memeriksa field berdampingan dengan dokumen. Mengklik sebuah field menyorot sumbernya.
   - Operator mengoreksi bila perlu, lalu menekan *Konfirmasi & validasi*.
   - Isu kritis memblokir validasi, misalnya field wajib kosong atau kadar N > 46%.
4. **Kalkulasi**:
   - Hanya dokumen tervalidasi yang dihitung. Rumus ada di `backend/app/core/engine.py`.
   - Setiap kalkulasi disimpan sebagai versi baru beserta salinan faktor emisi yang dipakai.
5. **Kunci periode** (Reviewer). Ada 5 syarat:
   - Pemisahan peran.
   - Dokumen wajib lengkap.
   - Tidak ada isu kritis.
   - Semua faktor disetujui.
   - Kalkulasi terbaru.

   Setelah dikunci, data tidak bisa diubah. Perubahan dilakukan dengan membuka revisi v2.
6. **Jejak audit**: setiap unggah, koreksi field, persetujuan, dan kalkulasi tercatat di tabel `audit_logs`.

## 7. Deploy

### Opsi A — Docker (paling mudah)

```bash
docker compose up -d --build
docker compose exec backend python -m app.seed --demo   # opsional
```

Hasilnya:

- Frontend: http://localhost:3000
- API: http://localhost:8000
- MySQL: port 3306

Untuk server sungguhan, sebelum build ubah:

- `JWT_SECRET`
- `CORS_ORIGINS` → domain frontend
- `NEXT_PUBLIC_API_URL` → domain API

### Opsi B — VPS tanpa Docker

- **Backend:**
  ```bash
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
  ```
  Jalankan lewat systemd atau supervisor.
- **Frontend:**
  ```bash
  npm run build && npm run start
  ```
  Jalankan lewat pm2.
- **Nginx:** pasang sebagai reverse proxy (`/` → 3000, `/api` → 8000) dengan HTTPS (certbot).

## 8. Endpoint utama

| Metode | Path | Keterangan |
| --- | --- | --- |
| POST | /api/auth/register | daftar perusahaan + fasilitas + produk + admin + periode pertama |
| POST | /api/auth/login | email + kata sandi → token |
| GET | /api/periods/{id}/dashboard | ringkasan, kebutuhan dokumen, isu, hasil terakhir |
| POST | /api/periods/{id}/documents | unggah banyak berkas (multipart `files`, opsional `type_code`) |
| GET/PATCH | /api/documents/{id} | detail + field + peta tata letak; ubah kategori → dibaca ulang |
| GET | /api/documents/{id}/pages/{n} | gambar halaman (scan sudah diluruskan) untuk penampil kotak sumber |
| PATCH | /api/documents/{id}/fields/{fid} | koreksi nilai, konfirmasi, atau pakai kandidat lain (`alt_index`) |
| DELETE | /api/documents/{id}/items/{i} | hapus satu baris hasil baca (mis. subtotal) |
| GET | /api/periods/{id}/activity | data aktivitas baku beserta dokumen & baris asalnya |
| POST | /api/documents/{id}/validate | konfirmasi operator |
| GET/PUT | /api/factors · POST /api/factors/{id}/approve | pustaka faktor emisi |
| POST | /api/periods/{id}/calculate | hitung (opsional `gwp_set`, `allocation_method`) |
| GET | /api/periods/{id}/gates · POST /lock · POST /reopen | penguncian periode |
| GET | /api/periods/{id}/export.xlsx · export.xml | ekspor laporan |
| GET/POST | /api/company/facilities · products · users | entitas pendukung perhitungan |

Daftar lengkap ada di http://localhost:8000/docs.

## 9. Cara mesin membaca dokumen

Angka tidak selalu berada di tempat yang sama, jadi mesin tidak mencari "baris ke-5" atau "pojok kanan atas".
Urutannya:

1. **Peta tata letak.** Setiap kata dicatat beserta kotaknya (x, y, lebar, tinggi) per halaman. Sumbernya:
   - PDF teks lewat pdfplumber.
   - Scan dan foto lewat OCR. Sebelum dibaca, halaman diputar bila terbalik atau menyamping, kemiringannya diluruskan, dan kontrasnya dibersihkan.
   - Excel dan CSV: baris dan kolom menjadi koordinat.
2. **Kenali jenis dokumen** dari kata kunci di isi dan nama berkas (10 kategori).
3. **Cari label** setiap field memakai daftar sinonim di `rules.py`, misalnya "Pemakaian", "kWh", "LWBP", "WBP"
   untuk listrik.
4. **Nilai kandidat angka di semua arah** dari label:

   | Posisi | Contoh |
   | --- | --- |
   | Kanan label | Nilai di ujung baris yang sama |
   | Bawah label | Judul kolom di atas, nilai di bawahnya |
   | Atas label | Angka besar di atas keterangan kecil |
   | Kiri label | Satuan atau label ditulis setelah angka |
   | Tabel | Judul kolom dikenali, setiap baris jadi data sendiri; baris Jumlah/Subtotal/Total dilewati |
   | Matriks | Perpotongan baris "COD" dan kolom "Inlet" |
   | Penjumlahan | LWBP + WBP |

   Setiap kandidat diberi skor menurut:
   - jarak dan kesejajaran dengan label,
   - kecocokan satuan (kg↔ton, kWh↔MWh, liter, m³),
   - rentang wajar,
   - kualitas OCR,
   - kata yang harus dihindari (Rp, harga, PPN, stand meter).
5. **Pilih yang terbaik.** Bila beberapa cara menemukan angka yang sama, keyakinannya naik ("2 cara sepakat").
   Kandidat lain tetap disimpan, dan di halaman validasi bisa dipakai dengan satu klik.
6. **Kotak sumber.** Posisi setiap angka disimpan, sehingga penampil dokumen menyorot tempat angka itu dibaca,
   bahkan pada scan yang sudah diluruskan.

Salah baca OCR yang umum dikoreksi di dalam angka, misalnya `O`→`0`, `l`→`1`, `S`→`5`. Format angka Indonesia dan
Inggris sama-sama dikenali (`1.533.400`, `16.000,50`, `1,533,400.5`).

Berkas uji di `backend/tests/fixtures` mencakup:
- angka di atas label,
- formulir kotak,
- tabel dua halaman,
- matriks lab,
- CSV titik koma,
- DOCX,
- scan yang diputar 90° dan foto miring.

Jalankan `pytest -q` untuk memastikan semuanya terbaca.

## 10. Batasan yang perlu diketahui

- **Format dokumen baru.** Bila pemasok memakai istilah yang belum dikenal, tambahkan sinonimnya di `core/rules.py`.
  Untuk format yang sangat tidak beraturan, fungsi `extract` di `core/extraction.py` bisa diganti dengan model AI
  tanpa mengubah API maupun tampilan.
- **Kualitas scan.** Foto yang buram atau gelap tetap terbaca sebagian. Angka dengan keyakinan rendah ditandai
  kuning dan wajib dikonfirmasi sebelum validasi.
- **Faktor emisi placeholder.** Faktor bertanda `[VERIFIKASI]` atau `[SUMBER]` harus diganti dengan sumber resmi
  terbaru (mis. faktor jaringan listrik KESDM) dan disetujui Reviewer sebelum laporan dipakai resmi.
- **Format XML.** Ekspor XML mengikuti isi template komunikasi emisi CBAM, tetapi **bukan** skema XSD resmi
  registri. Sesuaikan dengan format yang diminta importir.
- **Cakupan CBAM.** CBAM Uni Eropa saat ini mencakup semen, besi/baja, aluminium, pupuk, hidrogen, dan listrik.
  Untuk CPO/PKO, perhitungan ini berfungsi sebagai jejak karbon produk dengan metodologi gaya CBAM.
- **Penyimpanan token.** Token login disimpan di `localStorage`. Untuk produksi dengan kebutuhan keamanan lebih
  tinggi, pindahkan ke cookie httpOnly.

## 11. Masalah umum

| Gejala | Solusi |
| --- | --- |
| `RuntimeError: 'cryptography' package is required` | `pip install cryptography` (MySQL 8 memakai caching_sha2_password) |
| `Access denied for user` | cek user/kata sandi di `DATABASE_URL` pada `.env` |
| Frontend: "Tidak bisa terhubung ke server API" | pastikan uvicorn jalan di port 8000 dan `NEXT_PUBLIC_API_URL` benar, lalu restart `npm run dev` |
| Error CORS di console browser | tambahkan alamat frontend ke `CORS_ORIGINS` di `.env` backend |
| Dokumen scan: "Teks tidak terbaca" | Tesseract belum terpasang atau tidak ditemukan. Pasang (lihat Prasyarat), lalu tekan **Baca ulang** di halaman dokumen. Di Windows isi `TESSERACT_CMD` bila perlu. |
| Angka terbaca tapi salah pilih | Pilih kandidat lain di panel kanan halaman dokumen, atau ketik nilainya. Laporkan istilah label yang dipakai pemasok agar ditambahkan ke `rules.py`. |
| Intro tidak muncul lagi | Intro diputar sekali per sesi browser. Klik **Putar ulang intro** di kaki halaman depan. |
