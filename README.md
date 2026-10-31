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

Ada **tiga jenis akun**:

| Akun | Cara dibuat | Yang bisa dilakukan |
| --- | --- | --- |
| **Perusahaan** | Mendaftar sendiri di halaman **Daftarkan perusahaan** (`/register`) dengan email perusahaan + kata sandi | Mengisi profil, fasilitas, produk, periode · mengunggah dokumen · memeriksa & mengoreksi hasil baca · **mengajukan** dokumen ke admin · menjalankan kalkulasi draf · mengunduh laporan |
| **Admin peninjau** | Oleh **superadmin** di halaman **Admin peninjau** (`/superadmin/admin`) atau lewat `python -m app.cli create-admin` (tidak ada pendaftaran dari aplikasi) | Melihat portofolio semua perusahaan yang **ditugaskan** kepadanya · **menyetujui / mengembalikan** dokumen dengan catatan · mengoreksi angka saat meninjau · mengubah & menyetujui faktor emisi · **mengunci** periode · membuka revisi · membaca status kebutuhan perusahaan yang ditinjau |
| **Superadmin** | **Hanya** lewat `python -m app.cli create-superadmin` (tidak bisa dibuat atau dipromosikan lewat API maupun halaman registrasi) | Mengelola **katalog dokumen** · mengatur dokumen **Wajib / Opsional / Tidak berlaku per perusahaan** · mengelola **profil kebutuhan** · memutus **permintaan pengecualian** · membuat / menonaktifkan admin & menugaskannya · melihat **log audit**. Superadmin **tidak** mengunggah atau menyetujui dokumen dan **tidak** mengubah angka emisi |

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

### Status kebutuhan dokumen per perusahaan

Tidak semua perusahaan punya semua dokumen. Contohnya pabrik kelapa sawit (PKS) tanpa kebun sendiri tidak
punya dokumen pupuk dan lahan, dan perusahaan yang POME-nya diolah pihak lain tidak punya log POME. Karena
itu superadmin menetapkan status tiap pasangan **(perusahaan, jenis dokumen)**:

| Status | Arti | Pengaruh ke penguncian & perhitungan |
| --- | --- | --- |
| **Wajib** | Harus ada dan tervalidasi | Menghalangi penguncian bila belum ada |
| **Opsional** | Dipakai bila ada | Tidak menghalangi penguncian bila tidak ada |
| **Tidak berlaku** | Perusahaan memang tidak punya kegiatan ini | Kategori emisinya **dikeluarkan** dari perhitungan (bukan diisi 0 diam-diam) dan dicantumkan di laporan bersama alasan serta penetapnya |

**"Tidak berlaku" berbeda dengan "data tidak tersedia".** Kalau kategorinya berlaku tetapi dokumennya tidak
ada, kategori tetap dihitung. Untuk jenis yang punya nilai bawaan (saat ini POME), nilai bawaan literatur
dipakai dan ditandai *nilai bawaan* di dashboard, kalkulasi, dan laporan. Kalau POME berstatus Tidak berlaku,
nilai bawaan **tidak** dipakai.

Aturan pengaman:

- **Pabrik & produksi** tidak boleh berstatus Tidak berlaku, karena menjadi pembagi SEE. API menolaknya.
- Mengubah status jenis yang memengaruhi **Scope 1/2** (listrik, BBM, pupuk, lahan, POME, limbah B3) wajib
  disertai alasan tertulis minimal **15 karakter**.
- Faktor emisi yang hanya dipakai kategori Tidak berlaku (mis. `peat_co2` untuk perusahaan tanpa lahan) tidak
  perlu disetujui untuk mengunci periode.
- Perusahaan yang belum diatur memakai **status default katalog**: tujuh jenis pertama Wajib, transportasi,
  B3, dan air Opsional. Ini sama dengan perilaku sebelum fitur ini ada.

Cara status ditetapkan:

- **Langsung:** superadmin → **Perusahaan** → pilih perusahaan → ubah status. Pratinjau menampilkan gerbang
  penguncian yang berubah, baris emisi yang keluar dari total, dan periode terbuka yang terdampak.
- **Profil kebutuhan:** templat seperti "PKS terintegrasi kebun" atau "PKS tanpa kebun", diterapkan ke satu
  atau banyak perusahaan sekaligus (dengan *dry run* lebih dulu). Nilainya disalin; mengubah profil kemudian
  tidak mengubah perusahaan yang sudah memakainya.
- **Permintaan pengecualian:** perusahaan menekan **Ajukan pengecualian** di kartu kategori (halaman Dokumen),
  memilih *Tidak berlaku* atau *Opsional*, dan menulis alasan. Selama belum diputus, muncul peringatan
  `EXCEPTION_PENDING`. Superadmin menyetujui (status berubah) atau menolak dengan catatan.

Perubahan status hanya berlaku untuk **periode yang masih terbuka**, dan kalkulasinya ditandai perlu dihitung
ulang. Saat periode **dikunci**, status yang berlaku disalin ke periode itu (snapshot), sehingga perubahan
sesudahnya tidak mengubah periode terkunci. Membuka revisi mengembalikan periode ke status yang berlaku saat
itu. Semua perubahan status, profil, dan keputusan pengecualian tercatat di log audit (nilai lama → nilai
baru, alasan, pelaku).

Superadmin juga bisa menambah **jenis dokumen pendukung** di **Katalog dokumen**, misalnya sertifikat RSPO.
Jenis ini hanya berfungsi sebagai bukti: tanpa pembacaan angka otomatis dan tanpa rumus emisi. Jenis ini
muncul di daftar kebutuhan dan ikut gerbang penguncian bila berstatus Wajib. Sepuluh jenis bawaan tidak bisa
dihapus; hanya status default-nya yang bisa diubah.

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

### 3.4 Membuat superadmin & admin peninjau

Email dan kata sandi superadmin maupun admin **tidak** dikonfigurasi di `.env`. Keduanya disimpan sebagai
baris di tabel `users` (`role = 'superadmin'` atau `'admin'`, `company_id = NULL`, kata sandi berupa hash
bcrypt di `password_hash`). Jalankan dari folder `backend` dengan venv aktif:

```bash
# superadmin (pengelola sistem): HANYA bisa dibuat dari sini
python -m app.cli create-superadmin --email pengelola@karbonlens.id --name "Dewi Pengelola"
python -m app.cli list-superadmins
```

Superadmin masuk lewat halaman login yang sama dan diarahkan ke `/superadmin`. Dari sana superadmin bisa
membuat admin peninjau dan menugaskannya ke perusahaan. Cara lewat CLI tetap tersedia:

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

Penugasan dan status kebutuhan juga bisa diatur langsung lewat SQL (lihat contoh di akhir
`setup_mysql.sql`). Membuat akun lewat SQL hanya bisa bila hash bcrypt-nya dibuat lebih dulu:

```bash
python -c "from app.security import hash_password; print(hash_password('KataSandiKuat123'))"
```

```sql
INSERT INTO users (company_id, name, email, password_hash, role, is_active, created_at)
VALUES (NULL, 'Dewi Pengelola', 'pengelola@karbonlens.id', '<hash dari perintah di atas>', 'superadmin', 1, NOW());
INSERT INTO admin_companies (admin_id, company_id, assigned_at) VALUES (5, 2, NOW());
```

### 3.5 Mencoba alurnya

1. Buka <http://localhost:3000> → **Daftarkan perusahaan** (4 langkah: profil, fasilitas & produk,
   parameter perhitungan, akun login).
2. Unggah dokumen di menu **Kebutuhan & unggah**. Sistem mengenali kategorinya dan membaca angkanya.
3. Buka **Periksa & ajukan**, cocokkan angka dengan kotak sumber di dokumen, lalu **ajukan**.
4. Superadmin masuk → **Admin peninjau** → buat admin dan tugaskan ke perusahaan (atau lewat CLI, langkah 3.4).
   Bila perusahaan tidak punya kegiatan tertentu, superadmin mengatur statusnya di **Perusahaan** atau
   memutus permintaan pengecualian dari perusahaan di **Permintaan pengecualian**.
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
│   │   ├── routers/           auth, company, documents, periods, factors, admin, superadmin
│   │   ├── services/          penghubung database ↔ logika inti, ekspor laporan,
│   │   │                      requirements.py (status kebutuhan per perusahaan, snapshot, pengecualian, profil)
│   │   ├── cli.py             perintah pengelola sistem (buat superadmin, buat & tugaskan admin)
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
        │       ├── superadmin/     perusahaan & kebutuhan, pengecualian, profil, katalog, admin, audit
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
| GET | `/api/company/requirements` | perusahaan; admin yang ditugaskan (baca) |
| POST | `/api/company/exception-requests` (`{type_code, requested_status, reason}`) | perusahaan |
| GET/POST/PATCH | `/api/superadmin/doc-types` · `/doc-types/{code}` | superadmin |
| GET | `/api/superadmin/companies` · `/companies/{id}/requirements` | superadmin |
| PUT | `/api/superadmin/companies/{id}/requirements` (`{changes: [{code, status, expected}], reason}`, semua atau tidak sama sekali; 409 + daftar perbedaan bila sudah diubah superadmin lain) | superadmin |
| PUT | `/api/superadmin/companies/{id}/requirements/{code}` (`{status, reason}`) | superadmin |
| POST | `/api/superadmin/companies/{id}/requirements/preview` (`{changes: [{code, status}], reason}`, tanpa menyimpan) | superadmin |
| GET/POST/PATCH | `/api/superadmin/profiles` · `/profiles/{id}` · POST `/profiles/{id}/apply` (`{company_ids, dry_run, reason}`) | superadmin |
| GET/POST | `/api/superadmin/exceptions?status=pending` · `/exceptions/{id}/decide` (`{decision, note}`) | superadmin |
| GET/POST/PATCH | `/api/superadmin/admins` · `/admins/{id}` · POST/DELETE `/admins/{id}/companies/{company_id}` | superadmin |
| GET | `/api/superadmin/audit?company_id=&entity=&user_id=&action=&date_from=&date_to=` · `/audit/actors` | superadmin |

Admin mengirim header `X-Company-Id: <id>` untuk memilih perusahaan yang ditinjau (frontend melakukannya
otomatis). Header `Accept-Language: en` membuat pesan API berbahasa Inggris.

---

## 8. Memperbarui dari versi sebelumnya

Saat backend dijalankan, kolom baru ditambahkan otomatis dan akun lama milik perusahaan
(admin/operator/reviewer/viewer) diubah menjadi akun **perusahaan**. Admin peninjau dibuat ulang dengan
`python -m app.cli create-admin` lalu ditugaskan.

Pembaruan **superadmin & status kebutuhan** juga berjalan otomatis saat backend dijalankan (atau dengan
`python -m app.cli init-db`), tanpa menghapus data:

1. Tabel baru dibuat: `company_doc_requirements`, `requirement_profiles`, `requirement_profile_items`,
   `exception_requests`.
2. Kolom baru ditambahkan: `document_types` (`name_en`, `description_en`, `default_status`, `builtin`,
   `can_exclude`, `has_default`, `scope12`, `active`) dan `reporting_periods.requirements_snapshot`.
   `audit_logs.company_id` dibuat boleh NULL untuk perubahan global.
3. `default_status` diisi dari katalog. Perusahaan lama tidak punya pengaturan sendiri, sehingga perilakunya
   sama seperti sebelumnya.
4. Periode yang sudah terkunci diberi snapshot status default, sehingga tidak ikut berubah.
5. Buat superadmin pertama: `python -m app.cli create-superadmin --email … --name …`.

Bila ingin mulai bersih, hapus lalu buat ulang database:

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
| Admin melihat *Pilih perusahaan…* | Admin belum ditugaskan: superadmin → **Admin peninjau**, atau `python -m app.cli assign --admin … --company …` |
| Periode tidak bisa dikunci karena kategori yang memang tidak ada | Perusahaan menekan **Ajukan pengecualian**, atau superadmin mengubah statusnya menjadi *Tidak berlaku* / *Opsional* |
| Tombol kunci periode tidak aktif | Lihat daftar syarat di halaman **Laporan & penguncian**; semuanya harus centang |

---

## 10. Catatan metodologi

- Faktor bertanda **[VERIFIKASI]** atau **[SUMBER]** adalah placeholder. Admin peninjau wajib menggantinya
  dengan sumber resmi terbaru (mis. faktor emisi jaringan KESDM) sebelum periode dikunci.
- CO₂ biogenik dari biosolar dilaporkan terpisah; bagian fosil mengikuti angka campuran (B40 = 60% fosil).
- Limbah cair tanpa dokumen memakai nilai bawaan literatur dan ditandai di dashboard, kalkulasi, dan laporan.
- Kategori berstatus *Tidak berlaku* tidak dihitung sama sekali (baris rumusnya tidak dibuat) dan dicantumkan
  di lembar **Kategori dikecualikan** (XLSX) serta elemen `ExcludedCategories` (XML). Bila BBM tidak berlaku
  tetapi ada dokumen transportasi berisi volume BBM, BBM transportasi tetap dihitung.
