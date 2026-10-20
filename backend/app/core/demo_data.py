"""Dokumen contoh untuk data demo (angka sama dengan prototipe UI: SEE CPO 1,006).

Campuran format agar semua jalur ekstraksi terlihat: XLSX bulanan (tabel), PDF dengan angka
di atas keterangan, PDF tabel dua halaman, dan berkas teks.
"""
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parent.parent / "demo_files"

# berkas biner yang ikut dihitung (nilai identik dengan versi teks)
DEMO_FILES_COUNTED = [
    ("listrik_bulanan.xlsx", None),          # 12 bulan × 200.000 kWh
    ("ringkasan_solar_angka_atas.pdf", None),  # 1.533.400 L biosolar B40
    ("rekap_produksi_2_halaman.pdf", None),    # TBS 120.000 t, CPO 26.400 t, PKO 2.640 t
]
# berkas yang dibiarkan menunggu tinjauan (memperlihatkan antrean validasi)
DEMO_FILES_REVIEW = [
    ("faktur_bbm_tabel.pdf", None),
    ("scan_bbm_diputar.pdf", None),
]

MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober",
          "November", "Desember"]


def demo_documents(year: int) -> list[tuple[str, str | None, str]]:
    """Dokumen teks: (nama berkas, kategori atau None=biar sistem menebak, isi teks)."""
    return [
        ("Faktur_pupuk_urea.txt", None,
         f"PT Pupuk Nusantara\nFAKTUR PEMBELIAN PUPUK\nNo. FP/UREA/{year}/031\nJenis: Urea\nJumlah 1.800.000 kg\nKadar N: 46 %\n"),
        ("Rekap_aplikasi_NPK.txt", None,
         f"REKAP APLIKASI PUPUK {year}\nAfdeling I-IV\nJenis: NPK 15-15-6-4\nJumlah 4.146.667 kg\nKadar N: 15 %\n"),
        ("Lab_COD_POME.txt", None,
         f"LAPORAN LAB LIMBAH CAIR POME {year}\nVolume POME 72.000 m3\nCOD inlet 50.000 mg/L\nCOD outlet 5.000 mg/L\nKolam anaerob terbuka\n"),
        ("Master_blok_kebun.txt", "lahan",
         "MASTER BLOK TANAM\nAfdeling I-IV\nLuas tertanam 4.500 ha\nJenis tanah: mineral\nTahun tanam 2008\n"),
        ("Rekap_angkutan_TBS.txt", "transport",
         f"REKAP ANGKUTAN TBS {year}\nMuatan total 120.000 ton\nJarak rata-rata 25 km\nModa: truk\n"),
        ("Manifest_limbah_B3.txt", "b3",
         f"MANIFEST LIMBAH B3 {year}\nJenis: oli bekas\nJumlah 18 ton\nDiolah: insinerasi pihak ketiga berizin\n"),
        ("Faktur_bahan_kimia.txt", "material",
         f"PT Kimia Prima\nFAKTUR PEMBELIAN MATERIAL\nNo. KP/{year}/778\nMaterial: bahan kimia pengolahan air\n"
         "Jumlah 410 ton\nSEE pemasok 1,0 t CO2e/t\nNegara asal: Indonesia\n"),
    ]
