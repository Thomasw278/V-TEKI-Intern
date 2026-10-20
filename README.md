# KarbonLens — Emisi Tertanam Produk (CBAM)

Aplikasi web untuk menghitung **emisi tertanam spesifik (SEE) per ton produk** dari 10 kategori dokumen
operasional perusahaan (tagihan PLN, faktur BBM, rekap pupuk, manifest limbah, dan lainnya).
Dokumen dibaca otomatis, diperiksa oleh perusahaan, lalu disetujui oleh **admin peninjau** sebelum
periode dikunci dan laporan final diterbitkan.

Antarmuka tersedia dalam **Bahasa Indonesia & Inggris** dan **tema terang & gelap** (sakelar di bilah atas
setiap halaman), serta responsif untuk laptop dan ponsel.

| Bagian | Teknologi |
| --- | --- |
| Backend API | Python 3.11+ · FastAPI · SQLAlchemy 2 · PyMySQL |
| Database | MySQL 8 (atau MariaDB 10.5+ dari XAMPP/Laragon) |
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · CSS murni tanpa pustaka UI |
| Pembacaan dokumen | pdfplumber (posisi kata PDF) · Tesseract OCR + pelurusan halaman (scan/foto) · openpyxl (Excel) · CSV · DOCX · TXT |

---

## 1. Skema pengguna

Hanya ada **dua jenis akun**:

| Akun | Cara dibuat | Yang bisa dilakukan |
| --- | --- | --- |
| **Perusahaan** | Mendaftar sendiri di halaman **Daftarkan perusahaan** (`/register`) dengan email perusahaan + kata sandi | Mengisi profil, fasilitas, produk, periode · mengunggah dokumen · memeriksa & mengoreksi hasil baca · **mengajukan** dokumen ke admin · menjalankan kalkulasi draf · mengunduh laporan |
| **Admin peninjau** | **Hanya oleh superuser** lewat perintah `python -m app.cli` (tidak ada pendaftaran dari aplikasi) | Melihat portofolio semua perusahaan yang **ditugaskan** kepadanya · **menyetujui / mengembalikan** dokumen dengan catatan · mengoreksi angka saat meninjau · mengubah & menyetujui faktor emisi · **mengunci** periode · membuka revisi |

- Satu admin dapat menangani **beberapa perusahaan** (tabel `admin_companies`).
- Satu perusahaan dapat ditinjau oleh satu atau lebih admin.
- Admin hanya melihat perusahaan yang ditugaskan kepadanya; perusahaan hanya melihat datanya sendiri.
  Setiap permintaan API diperiksa terhadap perusahaan pemilik data (header `X-Company-Id` untuk admin).

### Alur status dokumen

```
diunggah → sedang dibaca → perlu diperiksa ──(perusahaan: ajukan)──► diajukan ──(admin: setujui)──► disetujui
                                 ▲                                       │
                                 └──────(admin: kembalikan + catatan)────┘  → dikembalikan
```

- Dokumen **diajukan** dan **disetujui** ikut dalam kalkulasi (kalkulasi draf bisa dijalankan kapan saja).
- Periode hanya bisa **dikunci oleh admin** setelah: kategori wajib terpenuhi, tidak ada pengajuan yang
  menunggu, tidak ada isu kritis, semua faktor emisi disetujui, dan kalkulasi terbaru dijalankan.
- Periode yang dikunci tidak bisa diubah; perubahan berikutnya menjadi **revisi** (v2, v3, …).

---

## 2. Kebutuhan perangkat lunak

| Perangkat lunak | Versi | Catatan |
| --- | --- | --- |
| Python | 3.11 – 3.13 | Windows: centang **Add python.exe to PATH** saat instalasi |
| Node.js | 20 LTS atau 22 LTS | sudah termasuk `npm` |
| MySQL | 8.x | atau MariaDB dari **XAMPP / Laragon** |
| Tesseract OCR | 5.x | opsional, hanya untuk dokumen hasil **scan/foto**. PDF digital, Excel, CSV, Word tetap terbaca tanpa Tesseract |

### Memasang Tesseract (untuk scan/foto)

- **Windows**: unduh installer dari <https://github.com/UB-Mannheim/tesseract/wiki>, pilih juga bahasa
  **Indonesian**. Lokasi bawaan `C:\Program Files\Tesseract-OCR\tesseract.exe` dikenali otomatis.
  Bila dipasang di tempat lain, isi `TESSERACT_CMD` di `backend/.env`.
- **macOS**: `brew install tesseract tesseract-lang`
- **Ubuntu/Debian**: `sudo apt install tesseract-ocr tesseract-ocr-ind tesseract-ocr-eng`

---

## 3. Instalasi & menjalankan di localhost

### 3.1 Database MySQL

Jalankan `backend/setup_mysql.sql` sekali sebagai root (lewat MySQL Workbench, phpMyAdmin, atau terminal):

```bash
mysql -u root -p < backend/setup_mysql.sql
```

Perintah ini membuat database `karbonlens` dan user `karbon` / `karbon123`. Tabel dibuat otomatis oleh
backend. Pengguna XAMPP: buka phpMyAdmin → tab **SQL** → tempel isi file lalu **Go**.

### 3.2 Backend (FastAPI) — terminal pertama

```bash
cd backend
python -m venv .venv

# aktifkan virtual environment
.venv\Scripts\activate          # Windows (PowerShell / CMD)
source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt
copy .env.example .env          # Windows   (macOS/Linux: cp .env.example .env)
```

Sesuaikan `backend/.env` bila perlu (sandi MySQL, `JWT_SECRET`, lokasi Tesseract), lalu:

```bash
python -m app.cli init-db                     # membuat tabel + katalog 10 jenis dokumen
uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000> · Dokumentasi interaktif: <http://localhost:8000/docs>
- PowerShell menolak `activate`? Jalankan sekali: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 3.3 Frontend (Next.js) — terminal kedua

```bash
cd frontend
npm install
copy .env.example .env.local    # Windows   (macOS/Linux: cp .env.example .env.local)
npm run dev
```

Buka <http://localhost:3000>. Mode produksi lokal: `npm run build` lalu `npm run start`.

### 3.4 Membuat admin peninjau (superuser)

Admin **tidak bisa** mendaftar dari aplikasi. Jalankan dari folder `backend` dengan venv aktif:

```bash
# 1. buat akun admin (kata sandi diketik tersembunyi, minimal 8 karakter)
python -m app.cli create-admin --email rina@verifikator.id --name "Rina Kartikasari"

# 2. lihat perusahaan yang sudah mendaftar
python -m app.cli list-companies

# 3. tugaskan admin ke perusahaan (pakai ID perusahaan atau email akun perusahaan)
python -m app.cli assign --admin rina@verifikator.id --company 1
python -m app.cli assign --admin rina@verifikator.id --company esg@kebunmitra.co.id

# lainnya
python -m app.cli list-admins                                   # admin & perusahaan yang ditinjau
python -m app.cli unassign --admin rina@verifikator.id --company 1
python -m app.cli set-password --email rina@verifikator.id      # atur ulang sandi (admin/perusahaan)
python -m app.cli deactivate --email rina@verifikator.id        # nonaktifkan akun
python -m app.cli activate   --email rina@verifikator.id
```

Penugasan juga bisa dilakukan langsung lewat SQL (lihat contoh di akhir `setup_mysql.sql`):

```sql
INSERT INTO admin_companies (admin_id, company_id, assigned_at) VALUES (5, 2, NOW());
```

### 3.5 Mencoba alurnya

1. Buka <http://localhost:3000> → **Daftarkan perusahaan** (4 langkah: profil, fasilitas & produk,
   parameter perhitungan, akun login).
2. Unggah dokumen di menu **Kebutuhan & unggah**. Sistem mengenali kategorinya dan membaca angkanya.
3. Buka **Periksa & ajukan**, cocokkan angka dengan kotak sumber di dokumen, lalu **ajukan**.
4. Superuser membuat admin dan menugaskannya ke perusahaan (langkah 3.4).
5. Admin masuk → **Perusahaan saya** → pilih perusahaan → **Tinjau pengajuan** → setujui / kembalikan,
   setujui faktor emisi, jalankan kalkulasi → **Laporan & penguncian** → kunci periode.
6. Unduh laporan XLSX (lengkap dengan jejak data) atau XML komunikasi emisi CBAM.

---

## 4. Pembacaan dokumen (OCR & ekstraksi)

Setiap berkas diubah menjadi peta posisi kata, lalu setiap field dicari dengan beberapa cara sekaligus;
kandidat dinilai dan kandidat lain disimpan agar bisa dipilih dengan satu klik.

| Situasi di dokumen | Cara menanganinya |
| --- | --- |
| Angka di **kanan / kiri / bawah / atas** label | Label sinonim (ID + EN) dicari di mana pun di halaman, nilai diambil dari posisi terdekat yang satuannya cocok |
| **Tabel** dengan banyak baris | Judul kolom dikenali, setiap baris menjadi item; baris *Subtotal/Total* dipakai untuk cek silang dan tidak dihitung dua kali; tabel berbeda dengan kolom sejenis tidak digabung |
| **Teks sel terbungkus** dua baris | Potongan di atas/bawah baris angka digabung kembali ke barisnya (mis. “Kemasan Bekas B3 (… Bahan” + “Kimia)”) |
| **Watermark** diagonal (SINTETIS, COPY, DRAFT) | Karakter miring/pucat berukuran besar dibuang sebelum kata disusun (PDF digital) atau disaring setelah OCR (scan) |
| Tagihan PLN dengan blok **LWBP + WBP** | Blok dijumlahkan menjadi satu tagihan dan dicocokkan dengan baris TOTAL; baris kVArh diabaikan; rekap 12 bulan tetap per bulan |
| **Bulan tagihan** | Diambil dari label terdekat (“Periode Tagihan : Januari 2026”), bukan dari tanggal cetak/jatuh tempo di baris yang sama |
| Nomor dokumen & pihak penerbit | Nomor dokumen dibedakan dari nomor izin, NPWP, telepon; pemasok/pengangkut dibedakan dari penghasil/pelanggan |
| **Scan miring / terbalik** | Halaman diputar & diluruskan, dibersihkan, dibaca beberapa kali lalu digabung; salah baca O→0, l→1 dikoreksi |

Hasil baca selalu berstatus **perlu diperiksa** sampai perusahaan mengajukannya, dan setiap koreksi tercatat
di jejak audit.

---

## 5. Konfigurasi

`backend/.env`

| Variabel | Contoh | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | `mysql+pymysql://karbon:karbon123@localhost:3306/karbonlens?charset=utf8mb4` | koneksi MySQL |
| `JWT_SECRET` | string acak ≥ 32 karakter | **wajib diganti** |
| `JWT_EXPIRE_HOURS` | `12` | lama sesi login |
| `STORAGE_DIR` | `./storage` | folder berkas unggahan |
| `MAX_UPLOAD_MB` | `50` | batas ukuran per berkas |
| `CORS_ORIGINS` | `http://localhost:3000` | alamat frontend |
| `TESSERACT_CMD` | `C:\Program Files\Tesseract-OCR\tesseract.exe` | kosongkan bila sudah di PATH |

`frontend/.env.local`

| Variabel | Contoh |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` |

---

## 6. Struktur folder

```
karbonlens/
├── backend/
│   ├── app/
│   │   ├── core/              logika inti murni Python (tanpa database)
│   │   │   ├── catalog.py        10 jenis dokumen, field, faktor emisi bawaan
│   │   │   ├── layout.py         peta posisi kata (PDF, Excel, CSV, DOCX, teks) + saring watermark
│   │   │   ├── ocr.py            OCR scan/foto: putar & luruskan, bersihkan citra, Tesseract
│   │   │   ├── rules.py          label, sinonim, satuan, rentang wajar per field
│   │   │   ├── extraction.py     klasifikasi + pencarian angka di kanan/bawah/atas/tabel
│   │   │   ├── aggregation.py    field dokumen → data aktivitas baku
│   │   │   ├── engine.py         rumus emisi, alokasi, SEE (Decimal)
│   │   │   └── validation.py     aturan validasi & kebutuhan dokumen
│   │   ├── routers/           auth, company, documents, periods, factors, admin
│   │   ├── services/          penghubung database ↔ logika inti, ekspor laporan
│   │   ├── cli.py             perintah superuser (buat & tugaskan admin)
│   │   ├── deps.py            sesi login, peran, isolasi data per perusahaan
│   │   ├── i18n.py            terjemahan pesan API ke bahasa Inggris
│   │   ├── models.py          tabel MySQL
│   │   ├── schemas.py         validasi request/response
│   │   └── main.py            aplikasi FastAPI
│   ├── storage/               berkas unggahan (tidak ikut git)
│   ├── requirements.txt
│   ├── setup_mysql.sql
│   └── .env.example
└── frontend/
    ├── public/fonts/          Gloock, Instrument Sans, JetBrains Mono (lisensi OFL)
    └── src/
        ├── app/
        │   ├── page.tsx          situs perusahaan + film pembuka
        │   ├── login/  register/
        │   └── (app)/            halaman setelah login
        │       ├── admin/          portofolio admin peninjau
        │       ├── dashboard/  dokumen/  dokumen/[id]/  validasi/  data/
        │       └── kalkulasi/  faktor/  laporan/  pengaturan/
        ├── components/        AppShell, DocViewer, charts, Intro, DocDemo, Ways, ui
        └── lib/               api, session, i18n (ID/EN), theme (terang/gelap), format, types
```

---

## 7. Endpoint API utama

| Metode | Path | Akses |
| --- | --- | --- |
| POST | `/api/auth/register` · `/api/auth/login` | publik (register hanya untuk perusahaan) |
| GET | `/api/auth/me` · PUT `/api/auth/profile` · POST `/api/auth/password` | semua akun |
| GET | `/api/admin/companies` · `/api/admin/queue` | admin |
| GET/PUT | `/api/company` · `/api/company/facilities` · `/api/company/products` | baca: keduanya · ubah: perusahaan |
| GET | `/api/company/reviewers` | keduanya |
| POST | `/api/periods/{id}/documents` (unggah) | perusahaan |
| PATCH | `/api/documents/{id}/fields/{fid}` (koreksi) | perusahaan; admin saat meninjau |
| POST | `/api/documents/{id}/validate` (ajukan) | perusahaan |
| POST | `/api/documents/{id}/approve` · `/reject` | admin |
| PUT/POST | `/api/factors/{id}` · `/api/factors/{id}/approve` | admin |
| POST | `/api/periods/{id}/calculate` | keduanya |
| POST | `/api/periods/{id}/lock` · `/reopen` | admin |
| GET | `/api/periods/{id}/export.xlsx` · `/export.xml` | keduanya |

Admin mengirim header `X-Company-Id: <id>` untuk memilih perusahaan yang ditinjau (frontend melakukannya
otomatis). Header `Accept-Language: en` membuat pesan API berbahasa Inggris.

---

## 8. Memperbarui dari versi sebelumnya

Saat backend dijalankan, kolom baru ditambahkan otomatis dan akun lama milik perusahaan
(admin/operator/reviewer/viewer) diubah menjadi akun **perusahaan**. Admin peninjau dibuat ulang dengan
`python -m app.cli create-admin` lalu ditugaskan. Bila ingin mulai bersih, hapus lalu buat ulang database:

```sql
DROP DATABASE karbonlens;
```

lalu jalankan lagi `setup_mysql.sql` dan `python -m app.cli init-db`.

---

## 9. Pemecahan masalah

| Gejala | Penyebab & solusi |
| --- | --- |
| `Can't connect to MySQL server` | MySQL belum berjalan, atau `DATABASE_URL` salah (port XAMPP biasanya 3306) |
| `Access denied for user 'karbon'` | Jalankan ulang `setup_mysql.sql` atau sesuaikan user/sandi di `.env` |
| Frontend: *Tidak bisa terhubung ke server API* | Backend belum berjalan di port 8000, atau `NEXT_PUBLIC_API_URL` / `CORS_ORIGINS` tidak cocok |
| Dokumen scan: *Teks tidak terbaca* | Tesseract belum terpasang atau `TESSERACT_CMD` salah; PDF digital tidak membutuhkan Tesseract |
| Admin melihat *Pilih perusahaan…* | Admin belum ditugaskan: `python -m app.cli assign --admin … --company …` |
| Tombol kunci periode tidak aktif | Lihat daftar syarat di halaman **Laporan & penguncian**; semuanya harus centang |

---

## 10. Catatan metodologi

- Faktor bertanda **[VERIFIKASI]** atau **[SUMBER]** adalah placeholder. Admin peninjau wajib menggantinya
  dengan sumber resmi terbaru (mis. faktor emisi jaringan KESDM) sebelum periode dikunci.
- CO₂ biogenik dari biosolar dilaporkan terpisah; bagian fosil mengikuti angka campuran (B40 = 60% fosil).
- Limbah cair tanpa dokumen memakai nilai bawaan literatur dan ditandai di dashboard, kalkulasi, dan laporan.
