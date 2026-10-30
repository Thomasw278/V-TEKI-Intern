"""Terjemahan pesan backend ke bahasa Inggris (frontend mengirim `Accept-Language: en`).

Logika inti tetap menulis pesan dalam bahasa Indonesia. Lapisan ini menerjemahkan string yang
dikenal di respons JSON (judul isu, catatan ekstraksi, nama kategori, pesan error, dll.) saat
pengguna memilih bahasa Inggris. Data milik pengguna (nama perusahaan, nama berkas, nilai field)
tidak pernah diubah: hanya string yang cocok persis dengan kamus/pola di bawah yang diterjemahkan.
"""
from __future__ import annotations

import json
import re

# ------------------------------------------------------------------ frasa tetap
EXACT: dict[str, str] = {
    # kategori dokumen
    "Pasokan material": "Material supply",
    "Energi & listrik": "Energy & electricity",
    "BBM energi fosil": "Fossil fuel",
    "Pupuk aplikasi kebun": "Fertiliser application",
    "Lahan kebun & panen": "Plantation land & harvest",
    "Pabrik & produksi": "Mill & production",
    "Limbah cair (POME)": "Wastewater (POME)",
    "Transportasi & logistik": "Transport & logistics",
    "Limbah padat & B3": "Solid & hazardous waste",
    "Air & bukti pendukung": "Water & supporting evidence",
    "Prekursor / hulu": "Precursors / upstream",
    "Scope 1 · N2O": "Scope 1 · N2O",
    "Scope 1 · lahan": "Scope 1 · land",
    "Pembagi SEE": "SEE denominator",
    "Scope 1 · CH4": "Scope 1 · CH4",
    "Hulu / hilir": "Upstream / downstream",
    "Pemeriksa silang": "Cross-check",
    "Hulu": "Upstream",
    "Faktur pembelian, surat jalan, sertifikat pemasok dengan nilai SEE.": "Purchase invoices, delivery notes, supplier certificates with SEE values.",
    "Tagihan PLN, catatan meter genset, catatan penjualan listrik.": "PLN bills, genset meter logs, electricity sales records.",
    "Faktur solar, stok BBM, log genset dan kendaraan.": "Diesel invoices, fuel stock, genset and vehicle logs.",
    "Faktur pupuk, rekap aplikasi per blok, tandan kosong.": "Fertiliser invoices, application per block, empty fruit bunches.",
    "Master blok tanam, rekap panen TBS, data jenis tanah.": "Block master data, FFB harvest summary, soil type data.",
    "Rekap produksi, tiket timbangan, laporan harian pabrik.": "Production summary, weighbridge tickets, daily mill reports.",
    "Log volume POME, laporan lab COD, catatan biogas.": "POME volume logs, COD lab reports, biogas records.",
    "Surat jalan, manifest, invoice ekspedisi.": "Delivery notes, manifests, freight invoices.",
    "Manifest B3, neraca limbah, berita acara pengolahan.": "Hazardous waste manifests, waste balance, treatment reports.",
    "Meter air, izin pengambilan air, laporan lab.": "Water meters, abstraction permits, lab reports.",
    # field
    "Nama material": "Material name", "Kuantitas": "Quantity", "Pemasok": "Supplier", "Negara asal": "Country of origin",
    "SEE pemasok": "Supplier SEE", "kWh dibeli": "kWh purchased", "Bulan tagihan": "Billing month", "kWh dijual": "kWh sold",
    "ID pelanggan": "Customer ID", "Jenis BBM": "Fuel type", "Volume": "Volume", "Penggunaan": "Usage",
    "Kuantitas BBM": "Fuel quantity",
    "Jenis pupuk": "Fertiliser type", "Massa pupuk": "Fertiliser mass", "Kadar N": "N content",
    "Pupuk organik (tankos)": "Organic fertiliser (EFB)", "Kadar N organik": "Organic N content", "Blok": "Block",
    "Luas": "Area", "Jenis tanah": "Soil type", "TBS dipanen": "FFB harvested", "Tahun tanam": "Planting year",
    "TBS diolah": "FFB processed", "Kode produk lain": "Other product code", "Tonase produk lain": "Other product tonnage",
    "Volume POME": "POME volume", "COD masuk": "COD inlet", "COD keluar": "COD outlet", "Biogas tertangkap": "Biogas captured",
    "Fraksi CH4 biogas": "Biogas CH4 fraction", "Muatan": "Load", "Jarak": "Distance", "Moda": "Mode",
    "Jenis limbah": "Waste type", "Massa": "Mass", "Metode olah": "Treatment", "Air diambil": "Water abstracted",
    "Sumber": "Source",
    # rincian kebutuhan
    "Material masuk": "Incoming material", "Faktur pembelian / surat jalan": "Purchase invoice / delivery note",
    "Sertifikat atau data emisi pemasok": "Supplier certificate or emission data",
    "Listrik kebun & pabrik dari PLN": "Plantation & mill electricity from PLN", "Tagihan / rekening listrik": "Electricity bills",
    "Cakupan 12 bulan": "12-month coverage", "Satu tagihan per bulan atau rekap tahunan": "One bill per month or an annual summary",
    "Penjualan listrik ke luar": "Electricity sold to others", "Catatan penjualan listrik": "Electricity sales records",
    "Solar kebun & pabrik": "Plantation & mill diesel", "Faktur pembelian / rekap BBM": "Purchase invoice / fuel summary",
    "Jenis & campuran BBM (mis. B40)": "Fuel type & blend (e.g. B40)", "Faktur BBM": "Fuel invoice",
    "Penggunaan (genset, kendaraan, alat berat)": "Usage (genset, vehicles, heavy equipment)",
    "Log genset / kendaraan": "Genset / vehicle log", "Pupuk kimia": "Chemical fertiliser",
    "Faktur atau rekap pemakaian (jumlah & kadar N)": "Invoice or usage summary (quantity & N content)",
    "Kadar N tiap jenis pupuk": "N content per fertiliser", "Label / spesifikasi pupuk": "Fertiliser label / specification",
    "Pupuk organik (tandan kosong)": "Organic fertiliser (empty fruit bunches)",
    "Catatan aplikasi tandan kosong": "EFB application records", "Blok tanam & luas": "Planted blocks & area",
    "Master blok tanam (luas, tahun tanam)": "Block master data (area, planting year)",
    "Jenis tanah / gambut": "Soil type / peat", "Data pengelolaan gambut": "Peat management data",
    "Produksi TBS kebun": "Plantation FFB production", "Rekap panen kebun": "Harvest summary",
    "Pengolahan TBS": "FFB processing", "Rekap produksi / laporan harian pabrik": "Production summary / daily mill report",
    "Produksi CPO": "CPO production", "Rekap produksi / tiket timbangan": "Production summary / weighbridge tickets",
    "Produksi PKO / kernel": "PKO / kernel production", "Rekap produksi": "Production summary",
    "Volume limbah cair (POME)": "Wastewater (POME) volume", "Log volume POME": "POME volume log",
    "COD masuk & keluar": "COD inlet & outlet", "Laporan laboratorium COD": "COD lab report",
    "Penangkapan metana": "Methane capture", "Catatan biogas / flare": "Biogas / flare records",
    "Muatan angkutan": "Transported load", "Surat jalan / manifest": "Delivery note / manifest",
    "Jarak tempuh": "Distance travelled", "Rute / invoice ekspedisi": "Route / freight invoice",
    "Limbah B3 dikirim": "Hazardous waste shipped", "Manifest limbah B3": "Hazardous waste manifest",
    "Metode pengolahan": "Treatment method", "Berita acara pengolahan": "Treatment report",
    "Pengambilan air": "Water abstraction", "Meter air / tagihan PDAM": "Water meter / utility bill",
    "Sumber air": "Water source", "Izin pengambilan air": "Water abstraction permit",
    # isu
    "Kategori belum dipilih": "Category not selected",
    "Pilih salah satu dari 10 kategori dokumen.": "Choose one of the 10 document categories.",
    "Belum ada data terbaca": "No data read yet",
    "Isi field secara manual atau unggah ulang dokumen yang lebih jelas.": "Fill the fields manually or upload a clearer copy.",
    "Kadar N harus 0–46% (urea 46%).": "N content must be 0–46% (urea is 46%).",
    "COD masuk POME umumnya 10.000–100.000 mg/L.": "POME inlet COD is usually 10,000–100,000 mg/L.",
    "Periksa kembali angka COD keluar dan masuk.": "Check the inlet and outlet COD values.",
    "Nilai tidak boleh negatif.": "Values cannot be negative.",
    "Nilai bukan angka": "Value is not a number", "Periksa format angka.": "Check the number format.",
    "Kategori wajib belum memiliki dokumen tervalidasi.": "This required category has no validated document yet.",
    "Periksa angkanya lalu ajukan ke admin. Dokumen ini belum ikut dihitung.": "Check the figures and submit them to the reviewer. These documents are not counted yet.",
    "Perbaiki sesuai catatan admin lalu ajukan ulang.": "Fix them according to the reviewer's note, then resubmit.",
    "Sudah ikut dihitung sebagai draf; laporan final menunggu persetujuan.": "Already counted in the draft; the final report waits for approval.",
    "Rendemen CPO tidak lazim": "Unusual CPO extraction rate",
    "Rasio POME/TBS tidak lazim": "Unusual POME/FFB ratio",
    "Nomor dokumen ganda": "Duplicate document number",
    # gerbang kunci
    "Dikunci oleh admin peninjau": "Locked by the assigned reviewer",
    "Hanya admin yang ditugaskan untuk perusahaan ini yang dapat mengunci periode.": "Only a reviewer assigned to this company can lock the period.",
    "Dokumen wajib tervalidasi": "Required documents validated",
    "Semua pengajuan sudah ditinjau": "All submissions reviewed",
    "Tidak ada dokumen yang menunggu.": "No documents waiting.",
    "Tidak ada isu kritis": "No critical issues", "0 isu kritis.": "0 critical issues.",
    "Faktor emisi disetujui": "Emission factors approved", "Semua faktor disetujui.": "All factors approved.",
    "Kalkulasi terbaru": "Calculation is up to date",
    "Kalkulasi dijalankan setelah perubahan data terakhir.": "The calculation ran after the latest data change.",
    "Jalankan kalkulasi ulang setelah perubahan data terakhir.": "Run the calculation again after the latest data change.",
    "Syarat penguncian belum terpenuhi": "Lock requirements are not met yet",
    "Masih ada isu kritis": "There are still critical issues",
    # faktor & baris kalkulasi
    "Solar / diesel — CO2": "Diesel — CO2", "Bensin — CO2": "Gasoline — CO2",
    "Faktor emisi jaringan listrik": "Grid electricity emission factor", "N2O langsung EF1": "Direct N2O EF1",
    "Urea — fraksi C": "Urea — C fraction", "MCF kolam anaerob": "Anaerobic pond MCF",
    "Nilai bawaan volume POME": "Default POME volume", "Nilai bawaan ΔCOD POME": "Default POME ΔCOD",
    "Fraksi CH4 biogas bawaan": "Default biogas CH4 fraction", "Emisi gambut terdrainase (sawit)": "Drained peat emissions (oil palm)",
    "Truk diesel": "Diesel truck", "Pengolahan limbah padat/B3": "Solid/hazardous waste treatment",
    "BBM fosil": "Fossil fuel", "Listrik dibeli": "Purchased electricity", "Pupuk — N2O": "Fertiliser — N2O",
    "Pupuk — urea CO2": "Fertiliser — urea CO2", "Limbah cair (POME) — CH4": "Wastewater (POME) — CH4",
    "Lahan gambut": "Peat land", "Transportasi": "Transport", "Material prekursor": "Precursor materials",
    "EF per jenis BBM × fraksi fosil": "EF per fuel type × fossil share",
    "E = Σ volume × fraksi fosil × EF ÷ 1000": "E = Σ volume × fossil share × EF ÷ 1000",
    "E = MWh dibeli × EF jaringan": "E = MWh purchased × grid EF",
    "E = massa urea × 0,20 × 44/12": "E = urea mass × 0.20 × 44/12",
    "E = (volume × ΔCOD × Bo × MCF ÷ 1000 − CH4 tertangkap) × GWP CH4": "E = (volume × ΔCOD × Bo × MCF ÷ 1000 − CH4 captured) × GWP CH4",
    "E = luas gambut × EF gambut": "E = peat area × peat EF",
    "E = massa × EF metode olah": "E = mass × treatment EF",
    "E = muatan × jarak × EF moda ÷ 1000": "E = load × distance × mode EF ÷ 1000",
    "E = Σ massa material × SEE material": "E = Σ material mass × material SEE",
    "Listrik dijual": "Electricity sold", "Urea": "Urea", "N dari pupuk organik": "N from organic fertiliser",
    "Limbah": "Waste",
    "Tidak ada dokumen POME tervalidasi — memakai nilai bawaan literatur": "No validated POME document — using literature defaults",
    "Volume POME tidak ada di dokumen — memakai nilai bawaan × TBS diolah": "POME volume missing — using default × FFB processed",
    "Tonase produk belum ada — unggah dokumen produksi terlebih dulu": "No product tonnage yet — upload production documents first",
    "Harga produk wajib diisi untuk alokasi ekonomi": "Product prices are required for economic allocation",
    "Diserahkan ke pengumpul berizin": "Handed to a licensed collector",
    # pemrosesan dokumen
    "Kategori tidak dikenali. Pilih kategori secara manual.": "Category not recognised. Choose a category manually.",
    "Teks tidak terbaca. Pasang Tesseract OCR untuk dokumen hasil scan, atau isi field secara manual.": "No readable text. Install Tesseract OCR for scanned documents, or fill the fields manually.",
    "Tidak ada field yang terbaca untuk kategori ini. Periksa kategori atau isi field secara manual.": "No fields were read for this category. Check the category or fill the fields manually.",
    "OCR (Tesseract) belum terpasang — isi field secara manual.": "OCR (Tesseract) is not installed — fill the fields manually.",
    "Derau terdeteksi: hasil beberapa pembacaan OCR digabung.": "Noise detected: several OCR passes were merged.",
    "Satuan sak/karung dikonversi dengan asumsi 50 kg per sak. Koreksi bila berbeda.": "Bags were converted assuming 50 kg per bag. Correct this if different.",
    "Diisi manual": "Filled in manually",
    # error HTTP
    "Baris tidak ditemukan": "Row not found", "Format ini dipratinjau sebagai teks/tabel": "This format is previewed as text/table",
    "Halaman tidak ada": "Page does not exist", "Fasilitas tidak ditemukan untuk perusahaan ini": "Facility not found for this company",
    "Field tidak dikenal untuk kategori ini": "Unknown field for this category", "Kandidat tidak ada": "Candidate does not exist",
    "Kategori dokumen tidak dikenal": "Unknown document category", "Kategori tidak dikenal": "Unknown category",
    "Kata sandi saat ini salah": "Current password is incorrect",
    "Pilih perusahaan yang ingin ditinjau terlebih dulu": "Choose a company to review first",
    "Akun tidak aktif": "Account is inactive", "Email atau kata sandi salah": "Incorrect email or password",
    "Sesi berakhir, silakan login ulang": "Your session has ended, please sign in again",
    "Silakan login terlebih dulu": "Please sign in first", "Token tidak valid": "Invalid token",
    "Akun dinonaktifkan. Hubungi pengelola sistem.": "This account is disabled. Contact the system administrator.",
    "Akun ini tidak terhubung ke perusahaan": "This account is not linked to a company",
    "Anda tidak ditugaskan untuk meninjau perusahaan ini": "You are not assigned to review this company",
    "Hanya admin peninjau yang bisa melakukan aksi ini": "Only reviewers can do this",
    "Aksi ini hanya untuk akun perusahaan": "This action is for company accounts only",
    "Aksi ini hanya untuk admin peninjau": "This action is for reviewers only",
    "Peran Anda tidak diizinkan untuk aksi ini": "Your role is not allowed to do this",
    "Belum ada kalkulasi untuk periode ini": "No calculation for this period yet",
    "Berkas fisik tidak ditemukan di penyimpanan": "The stored file could not be found",
    "Dokumen tidak ditemukan": "Document not found", "Faktor tidak ditemukan": "Factor not found",
    "Fasilitas tidak ditemukan": "Facility not found", "Field tidak ditemukan": "Field not found",
    "Jalankan kalkulasi terlebih dulu": "Run a calculation first", "Periode tidak ditemukan": "Period not found",
    "Produk tidak ditemukan": "Product not found",
    "Dokumen masih dibaca. Tunggu sampai selesai.": "The document is still being read. Wait until it finishes.",
    "Dokumen sudah disetujui admin dan tidak dibaca ulang": "The document is approved and will not be re-read",
    "Dokumen sudah disetujui admin": "The document is already approved",
    "Dokumen yang sudah disetujui tidak bisa dihapus. Minta admin mengembalikannya.": "Approved documents cannot be deleted. Ask the reviewer to return it.",
    "Email sudah terdaftar. Silakan login.": "This email is already registered. Please sign in.",
    "Field sudah ada, ubah nilainya saja": "The field already exists; edit its value instead",
    "Hanya dokumen yang sudah diajukan perusahaan yang bisa disetujui": "Only documents submitted by the company can be approved",
    "Minimal harus ada satu produk untuk alokasi emisi": "At least one product is needed for allocation",
    "Periode belum terkunci": "The period is not locked",
    "Periode sudah dikunci. Buka revisi untuk mengubah data.": "The period is locked. Open a revision to change data.",
    "Sistem": "System",
}

# ------------------------------------------------------------------ pola dengan angka/nama
# Elemen ketiga (opsional) membatasi pola ke kunci JSON tertentu supaya nama milik pengguna
# (mis. perusahaan "PT Air Mas") tidak ikut diterjemahkan.
TITLE = frozenset({"title"})
METRIC = frozenset({"metric"})
SUMMARY = frozenset({"summary"})
_P: list[tuple] = [
    (r"Baris (\d+): (.+)", lambda m: f"Row {m[1]}: {translate(m[2])}"),
    (r"(.+) kosong", lambda m: f"{translate(m[1])} is empty", TITLE),
    (r"Field wajib '(.+)' belum terisi\.", lambda m: f"Required field '{translate(m[1])}' is empty."),
    (r"(.+) perlu dicek", lambda m: f"Check {translate(m[1])}", TITLE),
    (r"Keyakinan ekstraksi ([\d,]+)\. Konfirmasi atau koreksi nilainya\.",
     lambda m: f"Extraction confidence {m[1].replace(',', '.')}. Confirm or correct the value."),
    (r"Kadar N di luar rentang", "N content out of range"),
    (r"COD masuk tidak lazim", "Unusual inlet COD"),
    (r"COD keluar > COD masuk", "Outlet COD > inlet COD"),
    (r"(.+) negatif", lambda m: f"{translate(m[1])} is negative", TITLE),
    (r"(.+) memakai nilai bawaan", lambda m: f"{translate(m[1])} uses default values", TITLE),
    (r"(.+)\. Unggah dokumen asli untuk mengganti\.", lambda m: f"{translate(m[1])}. Upload the actual document to replace it."),
    (r"(.+) belum ada", lambda m: f"{translate(m[1])} is missing", TITLE),
    (r"(\d+) dokumen belum diajukan", r"\1 documents not submitted"),
    (r"(\d+) dokumen dikembalikan admin", r"\1 documents returned by the reviewer"),
    (r"(\d+) dokumen menunggu persetujuan admin", r"\1 documents awaiting approval"),
    (r"(\d+) dokumen menunggu persetujuan admin\.", r"\1 documents are awaiting approval."),
    (r"Tagihan listrik (\d+) dari 12 bulan", r"Electricity bills for \1 of 12 months"),
    (r"Bulan belum ada: (.+)", lambda m: "Missing months: " + m[1].replace("Mei", "May").replace("Agu", "Aug")
     .replace("Okt", "Oct").replace("Des", "Dec")),
    (r"Tonase (\S+) nol", r"\1 tonnage is zero"),
    (r"Dokumen produksi belum mencatat tonase (\S+)\. SEE tidak bisa dihitung\.",
     r"Production documents have no \1 tonnage. SEE cannot be calculated."),
    (r"Rendemen ([\d.,]+)% \(lazim 18–26% dari TBS diolah\)\.", r"Extraction rate \1% (typically 18–26% of FFB processed)."),
    (r"([\d.,]+) m3/t \(lazim 0,5–0,7 m3/t TBS diolah\)\.", r"\1 m3/t (typically 0.5–0.7 m3/t FFB processed)."),
    (r"Nomor (.+) muncul lebih dari sekali\.", r"Number \1 appears more than once."),
    (r"(\d+) faktor emisi belum disetujui", r"\1 emission factors not approved"),
    (r"Draf: (.+)\. Hasil hanya untuk internal sampai disetujui admin peninjau\.",
     lambda m: "Draft: " + ", ".join(translate(x) for x in m[1].split(", ")) + ". Results are internal until a reviewer approves them."),
    (r"(\d+) dari (\d+) kategori wajib tervalidasi\.", r"\1 of \2 required categories validated."),
    (r"(\d+) isu kritis terbuka\.", r"\1 open critical issues."),
    (r"(\d+) faktor masih draf\.", r"\1 factors are still drafts."),
    (r"(\d+)/12 bulan", r"\1/12 months"),
    (r"Data dibaca dari tabel \((\d+) baris(?:, (\d+) halaman)?\)\.",
     lambda m: f"Data read from a table ({m[1]} rows" + (f", {m[2]} pages" if m[2] else "") + ")."),
    (r"Ditemukan (\d+) item pada dokumen\.", r"Found \1 items in the document."),
    (r"(\d+) blok dalam satu dokumen dijumlahkan menjadi satu tagihan \((.+)\)\.",
     r"\1 blocks in one document were added up into one bill (\2)."),
    (r"Total dokumen (.+) dipakai; jumlah blok (.+) berbeda\. Periksa angkanya\.",
     r"Document total \1 used; the blocks add up to \2. Check the figures."),
    (r"Jumlah baris \((.+)\) berbeda dengan total dokumen \((.+)\)\. Periksa baris yang terlewat\.",
     r"Row sum (\1) differs from the document total (\2). Check for missed rows."),
    (r"Total baris cocok dengan total dokumen \((.+)\)\.", r"Rows match the document total (\1)."),
    (r"Watermark diabaikan: (.+)", r"Watermark ignored: \1"),
    (r"Huruf watermark/stempel diabaikan: (.+)", r"Watermark/stamp letters ignored: \1"),
    (r"Halaman (\d+): (.+)", lambda m: f"Page {m[1]}: {translate(m[2])}"),
    (r"Halaman (\d+) berupa gambar tetapi OCR \(Tesseract\) belum terpasang\.",
     r"Page \1 is an image but OCR (Tesseract) is not installed."),
    (r"Gambar diputar (-?\d+)° sebelum dibaca\.", r"Image rotated \1° before reading."),
    (r"Kemiringan ([+-]?[\d.]+)° dikoreksi\.", r"Skew of \1° corrected."),
    (r"Kualitas scan rendah \(keyakinan OCR rata-rata (\d+%)\)\. Periksa angka dengan teliti\.",
     r"Low scan quality (average OCR confidence \1). Check the figures carefully."),
    (r"Berkas tidak bisa dibaca: (.+)", r"File cannot be read: \1"),
    (r"Format (\S+) belum didukung", r"Format \1 is not supported"),
    (r"Gagal diproses: (.+)", r"Processing failed: \1"),
    (r"Halaman tidak bisa dirender: (.+)", r"Page cannot be rendered: \1"),
    (r"(.+) melebihi (\d+) MB", r"\1 exceeds \2 MB"),
    (r"(.+) sama persis dengan dokumen #(\d+) \((.+)\)", r"\1 is identical to document #\2 (\3)"),
    (r"Format (\S+) tidak didukung: (.+)", r"Format \1 is not supported: \2"),
    (r"Kode produk (\S+) sudah ada", r"Product code \1 already exists"),
    (r"Periode (\d+) sudah ada", r"Period \1 already exists"),
    (r"'(.+)' bukan angka yang valid untuk (.+)", lambda m: f"'{m[1]}' is not a valid number for {translate(m[2])}"),
    (r"Volume (.+)", lambda m: f"{m[1]} volume", METRIC),
    (r"N dari (.+)", r"N from \1", METRIC),
    (r"Gambut (.*)", lambda m: f"Peat {m[1]}".strip(), METRIC),
    (r"Tanah mineral (.*)", lambda m: f"Mineral soil {m[1]}".strip(), METRIC),
    (r"Produksi (\S+)", r"\1 production", METRIC),
    (r"Angkutan (.*)", lambda m: f"Transport {m[1]}".strip(), METRIC),
    (r"Air (.*)", lambda m: f"Water {m[1]}".strip(), METRIC),
    (r"([\d.,]+) ha gambut", r"\1 ha peat", METRIC),
    (r"(\d+) baris material", r"\1 material rows", METRIC),
    (r"Set GWP tidak dikenal: (.+)", r"Unknown GWP set: \1"),
    (r"Metode alokasi tidak dikenal: (.+)", r"Unknown allocation method: \1"),
    (r"Faktor emisi '(.+)' belum tersedia", r"Emission factor '\1' is not available"),
    # jejak audit
    (r"(.+) masuk", r"\1 signed in", SUMMARY),
    (r"Mengunggah (.+)", r"Uploaded \1", SUMMARY),
    (r"Mengajukan (.+) untuk ditinjau", r"Submitted \1 for review", SUMMARY),
    (r"Menyetujui faktor (.+)", r"Approved factor \1", SUMMARY),
    (r"Menyetujui (.+)", r"Approved \1", SUMMARY),
    (r"Mengembalikan (.+)", r"Returned \1", SUMMARY),
    (r"Menghapus (.+)", r"Deleted \1", SUMMARY),
    (r"Mengunci periode (\d+) \((v\d+)\)", r"Locked period \1 (\2)", SUMMARY),
    (r"Membuka revisi (v\d+) periode (\d+)", r"Opened revision \1 of period \2", SUMMARY),
    (r"Membuka periode (\d+)", r"Opened period \1", SUMMARY),
    (r"Kalkulasi (v\d+) \((AR\d), alokasi ekonomi\) total (.+)", r"Calculation \1 (\2, economic allocation) total \3", SUMMARY),
    (r"Kalkulasi (v\d+) \((AR\d), alokasi massa\) total (.+)", r"Calculation \1 (\2, mass allocation) total \3", SUMMARY),
    (r"Faktor (.+) → (.+)", r"Factor \1 → \2", SUMMARY),
    (r"Kategori (.+): (.+) → (.+)", r"Category of \1: \2 → \3", SUMMARY),
    (r"Hapus baris (\d+) di (.+)", r"Deleted row \1 in \2", SUMMARY),
    (r"Isi manual (.+)", r"Filled manually: \1", SUMMARY),
    (r"Konfirmasi (.+)", lambda m: f"Confirmed {translate(m[1])}", SUMMARY),
    (r"Membaca (.+)", r"Read \1", SUMMARY),
    (r"(Fasilitas|Produk) (.+) (ditambahkan|diperbarui|dihapus)",
     lambda m: f"{'Facility' if m[1] == 'Fasilitas' else 'Product'} {m[2]} "
               + {"ditambahkan": "added", "diperbarui": "updated", "dihapus": "deleted"}[m[3]], SUMMARY),
    (r"Profil & parameter perusahaan diperbarui", "Company profile & parameters updated"),
    (r"Kata sandi akun diganti", "Account password changed"),
    (r"Perusahaan (.+) terdaftar", r"Company \1 registered", SUMMARY),
]
PATTERNS = [(re.compile(rf"^{t[0]}$", re.S), t[1], t[2] if len(t) > 2 else None) for t in _P]

# Kunci JSON yang nilainya boleh diterjemahkan (nilai milik pengguna tidak pernah cocok persis dengan kamus)
KEYS = {"detail", "message", "title", "name", "note", "label", "hint", "description", "scope", "error", "summary",
        "metric", "formula", "factor", "activity", "notes", "fields", "warnings", "defaults_used", "user"}


_KEY: list[str | None] = [None]


def translate(text: str, key: str | None = None) -> str:
    """Terjemahan satu string. `key` = kunci JSON asalnya (untuk pola yang dibatasi)."""
    if not isinstance(text, str) or not text:
        return text
    hit = EXACT.get(text)
    if hit is not None:
        return hit
    key = key if key is not None else _KEY[-1]
    for rx, rep, keys in PATTERNS:
        if keys is not None and key not in keys:
            continue
        m = rx.match(text)
        if m:
            _KEY.append(key)
            try:
                return rep(m) if callable(rep) else m.expand(rep)
            finally:
                _KEY.pop()
    return text


def translate_obj(obj, key: str | None = None):
    """Telusuri JSON; terjemahkan string di bawah kunci yang dikenal."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == "defaults_used" and isinstance(v, dict):
                out[k] = {dk: translate(dv) if isinstance(dv, str) else dv for dk, dv in v.items()}
            else:
                out[k] = translate_obj(v, k)
        return out
    if isinstance(obj, list):
        return [translate_obj(v, key) for v in obj]
    if isinstance(obj, str) and key in KEYS:
        return translate(obj, key)
    return obj


class LanguageMiddleware:
    """ASGI: bila klien meminta bahasa Inggris, terjemahkan respons JSON sebelum dikirim.

    Respons non-JSON (berkas, gambar halaman, unduhan laporan) diteruskan tanpa diubah. Body JSON
    dikirim begitu potongan terakhir diterima, sehingga BackgroundTasks tetap berjalan setelahnya.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        lang = headers.get(b"accept-language", b"").decode("latin-1").strip().lower()
        if not lang.startswith("en"):
            return await self.app(scope, receive, send)

        start: dict | None = None
        chunks: list[bytes] = []
        passthrough = False

        async def wrapped(message):
            nonlocal start, passthrough
            if message["type"] == "http.response.start":
                ctype = dict(message.get("headers") or []).get(b"content-type", b"")
                if not ctype.startswith(b"application/json"):
                    passthrough = True
                    return await send(message)
                start = message
                return None
            if message["type"] == "http.response.body" and not passthrough and start is not None:
                chunks.append(message.get("body", b""))
                if message.get("more_body"):
                    return None
                body = b"".join(chunks)
                try:
                    body = json.dumps(translate_obj(json.loads(body)), ensure_ascii=False).encode("utf-8")
                except (ValueError, TypeError):
                    pass
                hdrs = [(k, v) for k, v in start.get("headers", []) if k.lower() != b"content-length"]
                hdrs.append((b"content-length", str(len(body)).encode()))
                await send({**start, "headers": hdrs})
                return await send({"type": "http.response.body", "body": body, "more_body": False})
            return await send(message)

        await self.app(scope, receive, wrapped)
