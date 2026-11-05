"""OCR untuk foto/scan dokumen dengan Tesseract.

Langkah:
1. Koreksi orientasi EXIF dan rotasi 90/180/270° (Tesseract OSD).
2. Normalisasi ukuran agar tinggi huruf cukup untuk dibaca (upscale bila kecil).
3. Peningkatan kontras, binarisasi Otsu (untuk deteksi kemiringan).
4. Koreksi kemiringan kecil (deskew ±7°) dengan profil proyeksi.
5. Versi asli dan versi berlatar rata (arsiran sel, bayangan foto dihilangkan) dibaca; yang lebih terbaca dipakai.
6. Garis tabel (deretan piksel gelap horizontal/vertikal yang panjang) diputihkan, karena Tesseract sering
   kehilangan huruf dan angka yang menempel pada garis sel.
7. Dua kali OCR (blok seragam psm 6 + teks tersebar psm 11) lalu digabung,
   sehingga teks di pojok, kotak terpisah, atau tabel tanpa garis tetap terbaca.
8. Setiap kata disimpan dengan koordinat + skor keyakinan Tesseract; salah baca satuan yang khas
   ("(m7)" untuk m³, "(6)" untuk %) dibetulkan.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from dataclasses import dataclass, field

from .layout import Word

log = logging.getLogger(__name__)


@dataclass
class OcrResult:
    words: list[Word]
    width: int
    height: int
    image: object  # PIL.Image yang sudah dinormalisasi (dipakai pratinjau)
    mean_conf: float
    notes: list[str] = field(default_factory=list)


_WIN_PATHS = (r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe")


def tesseract_path() -> str | None:
    """Lokasi program Tesseract: TESSERACT_CMD di .env, PATH, atau lokasi instalasi Windows yang umum."""
    cmd = os.environ.get("TESSERACT_CMD", "").strip()
    if cmd and os.path.exists(cmd):
        return cmd
    found = shutil.which("tesseract")
    if found:
        return found
    return next((p for p in _WIN_PATHS if os.path.exists(p)), None)


def available() -> bool:
    try:
        import pytesseract
    except ImportError:
        return False
    cmd = tesseract_path()
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    return cmd is not None


_LANG: str | None = None


def _lang() -> str:
    global _LANG
    if _LANG is None:
        import pytesseract

        try:
            langs = set(pytesseract.get_languages(config=""))
        except Exception:
            langs = {"eng"}
        _LANG = "+".join(x for x in ("ind", "eng") if x in langs) or "eng"
    return _LANG


def _otsu(gray) -> int:
    hist = gray.histogram()[:256]
    total = sum(hist)
    sum_all = sum(i * h for i, h in enumerate(hist))
    w_b = sum_b = 0.0
    best, thr = 0.0, 128
    for t in range(256):
        w_b += hist[t]
        if w_b == 0:
            continue
        w_f = total - w_b
        if w_f == 0:
            break
        sum_b += t * hist[t]
        m_b, m_f = sum_b / w_b, (sum_all - sum_b) / w_f
        between = w_b * w_f * (m_b - m_f) ** 2
        if between > best:
            best, thr = between, t
    return thr


def _skew_angle(binary) -> float:
    """Sudut kemiringan dengan memaksimalkan varians profil proyeksi horizontal."""
    try:
        import numpy as np
    except ImportError:
        return 0.0
    small = binary.copy()
    small.thumbnail((900, 900))
    best_angle, best_score = 0.0, -1.0
    for angle in [a / 2 for a in range(-14, 15)]:
        rot = small.rotate(angle, expand=False, fillcolor=255)
        arr = np.asarray(rot, dtype=np.uint8) < 128
        profile = arr.sum(axis=1).astype(float)
        score = float(((profile[1:] - profile[:-1]) ** 2).sum())
        if score > best_score:
            best_score, best_angle = score, angle
    return best_angle


def _flatten(gray):
    """Ratakan latar: sel tabel yang diarsir abu-abu dan bayangan/pencahayaan foto yang tidak rata menjadi putih.

    Warna kertas lokal diperkirakan dengan filter maksimum pada gambar yang diperkecil (huruf hilang, latar
    tersisa), lalu gambar asli dibagi dengan perkiraan itu.
    """
    try:
        import numpy as np
        from PIL import Image, ImageFilter
    except ImportError:
        return gray
    f = 8
    small = gray.resize((max(1, gray.width // f), max(1, gray.height // f)), resample=2)
    bg = small.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    bg = np.asarray(bg.resize(gray.size, resample=2), dtype=np.float32)
    a = np.asarray(gray, dtype=np.float32)
    out = np.clip(a / np.maximum(bg, 1) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="L")


def _prepare(img):
    """Gambar abu-abu yang sudah diputar, diluruskan, dan dibersihkan derau (LSTM Tesseract lebih akurat
    pada citra abu-abu dibanding citra hitam-putih keras)."""
    from PIL import ImageFilter, ImageOps

    notes: list[str] = []
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("L", "RGB"):
        img = img.convert("RGB")
    gray = img.convert("L")

    long_side = max(gray.size)
    if long_side < 2200:
        scale = 2400 / long_side
        gray = gray.resize((int(gray.width * scale), int(gray.height * scale)), resample=3)
    elif long_side > 4200:
        scale = 3400 / long_side
        gray = gray.resize((int(gray.width * scale), int(gray.height * scale)), resample=3)

    try:
        import pytesseract

        osd = pytesseract.image_to_osd(gray, config="--psm 0 -c min_characters_to_try=20")
        rot = int(next(x.split(":")[1] for x in osd.splitlines() if x.startswith("Rotate:")).strip())
        if rot:
            gray = gray.rotate(-rot, expand=True, fillcolor=255)
            notes.append(f"Gambar diputar {rot}° sebelum dibaca.")
    except Exception:
        pass

    gray = ImageOps.autocontrast(gray.filter(ImageFilter.MedianFilter(3)), cutoff=1)
    thr = _otsu(gray)
    angle = _skew_angle(gray.point(lambda v: 255 if v > thr else 0, mode="L"))
    if abs(angle) >= 0.4:
        gray = gray.rotate(angle, expand=True, fillcolor=255, resample=3)
        notes.append(f"Kemiringan {angle:+.1f}° dikoreksi.")
    return gray, notes


def _long_runs(mask, length: int, axis: int):
    """True untuk piksel yang berada di dalam deretan True sepanjang ≥ length pada sumbu `axis`."""
    import numpy as np

    m = np.moveaxis(mask, axis, -1).astype(np.int32)
    n = m.shape[-1]
    if n < length:
        return np.zeros_like(mask, dtype=bool)
    zeros = np.zeros(m.shape[:-1] + (1,), dtype=np.int32)
    c = np.concatenate([zeros, np.cumsum(m, axis=-1)], axis=-1)
    full = (c[..., length:] - c[..., :-length]) == length          # jendela yang seluruhnya gelap, per titik awal
    wc = np.concatenate([zeros, np.cumsum(full, axis=-1, dtype=np.int32)], axis=-1)
    k = np.arange(n)
    lo = np.clip(k - length + 1, 0, n - length + 1)
    hi = np.clip(k + 1, 0, n - length + 1)
    return np.moveaxis((wc[..., hi] - wc[..., lo]) > 0, -1, axis)


def remove_rules(gray):
    """Putihkan garis tabel: deretan gelap sepanjang ≥ 1/14 lebar (atau 1/18 tinggi) halaman yang tebalnya
    hanya beberapa piksel. Huruf tidak pernah sepanjang dan setipis itu."""
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return gray
    a = np.asarray(gray, dtype=np.uint8)
    dark = a < min(_otsu(gray), 170)
    h, w = dark.shape
    # garis = deretan gelap yang panjang DAN tipis; huruf tebal yang menyatu karena buram itu panjang tetapi tebal
    thin = max(4, round(max(h, w) / 450))
    horiz = _long_runs(dark, max(60, w // 14), 1)
    horiz &= ~_long_runs(horiz, thin + 1, 0)
    vert = _long_runs(dark, max(60, h // 18), 0)
    vert &= ~_long_runs(vert, thin + 1, 1)
    lines = horiz | vert
    if lines.sum() < 0.0005 * h * w:
        return gray
    # tepi garis yang anti-aliased ikut dibersihkan
    grown = lines.copy()
    grown[1:, :] |= lines[:-1, :]
    grown[:-1, :] |= lines[1:, :]
    grown[:, 1:] |= lines[:, :-1]
    grown[:, :-1] |= lines[:, 1:]
    out = a.copy()
    out[grown] = 255
    return Image.fromarray(out, mode="L")


# salah baca satuan yang khas: superskrip ³ → "7"/"?" dan tanda % → "6"/"96"
_UNIT_FIXES = [
    (re.compile(r"^\(m[37?2³]\)(\W*)$"), r"(m3)\1"),
    (re.compile(r"^m[7?]$"), "m3"),
    (re.compile(r"^\((?:6|96|%6|o/o)\)(\W*)$"), r"(%)\1"),
]


def _fix_units(t: str) -> str:
    for rx, rep in _UNIT_FIXES:
        if rx.match(t):
            return rx.sub(rep, t)
    return t


def _run(img, psm: int) -> list[Word]:
    import pytesseract

    data = pytesseract.image_to_data(
        img, lang=_lang(), config=f"--oem 1 --psm {psm} -c preserve_interword_spaces=1",
        output_type=pytesseract.Output.DICT,
    )
    rows: list[tuple[tuple[int, int, int], Word]] = []
    for i, text in enumerate(data["text"]):
        t = (text or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if not t or conf < 40 or not re.search(r"[0-9A-Za-z%]", t):
            continue
        alnum = sum(ch.isalnum() for ch in t)
        if alnum <= 1 and conf < 70 and t != "%":
            continue  # bintik / derau yang terbaca sebagai huruf tunggal
        t = _fix_units(t)
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        rows.append((key, Word(t, float(x), float(y), float(x + w), float(y + h), conf / 100)))
    # gabungkan angka yang terpecah: "8." + "000" → "8.000"
    out: list[Word] = []
    prev_key = None
    for key, w in rows:
        if out and key == prev_key:
            p = out[-1]
            if re.fullmatch(r"\d{1,3}[.,]", p.text) and re.fullmatch(r"\d{3}(?:[.,]\d+)?\W*", w.text) and w.x0 - p.x1 < w.h * 1.2:
                out[-1] = Word(p.text + w.text, p.x0, min(p.y0, w.y0), w.x1, max(p.y1, w.y1), min(p.conf, w.conf))
                continue
        out.append(w)
        prev_key = key
    return out


def _quality(ws: list[Word]) -> float:
    """Skor keterbacaan satu hasil OCR: jumlah keyakinan kata yang berisi ≥ 2 huruf/angka."""
    return sum(w.conf for w in ws if sum(ch.isalnum() for ch in w.text) >= 2)


def _mean(ws: list[Word]) -> float:
    return sum(w.conf for w in ws) / len(ws) if ws else 0.0


def _iou(a: Word, b: Word) -> float:
    ix = max(0.0, min(a.x1, b.x1) - max(a.x0, b.x0))
    iy = max(0.0, min(a.y1, b.y1) - max(a.y0, b.y0))
    inter = ix * iy
    if inter <= 0:
        return 0.0
    ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter
    return inter / ua if ua > 0 else 0.0


def _covered(w: Word, others: list[Word]) -> bool:
    for o in others:
        ix = max(0.0, min(w.x1, o.x1) - max(w.x0, o.x0))
        iy = max(0.0, min(w.y1, o.y1) - max(w.y0, o.y0))
        small = min((w.x1 - w.x0) * (w.y1 - w.y0), (o.x1 - o.x0) * (o.y1 - o.y0)) or 1
        if ix * iy / small > 0.3:
            return True
    return False


def _fuse(passes: list[list[Word]]) -> list[Word]:
    """Gabungkan beberapa hasil OCR: di setiap posisi, ambil bacaan dengan keyakinan tertinggi."""
    pool = sorted((w for ws in passes for w in ws), key=lambda w: w.conf, reverse=True)
    out: list[Word] = []
    for w in pool:
        if not _covered(w, out):
            out.append(w)
    return out


def _drop_giants(words: list[Word]) -> tuple[list[Word], str]:
    """Buang huruf raksasa yang berdiri sendiri (watermark diagonal yang lolos pembersihan)."""
    if len(words) < 12:
        return words, ""
    hs = sorted(w.h for w in words)
    med = hs[len(hs) // 2]
    keep, gone = [], []
    for w in words:
        alnum = sum(ch.isalnum() for ch in w.text)
        if w.h > med * 3.2 and alnum <= 3 and not any(ch.isdigit() for ch in w.text):
            gone.append(w.text)
        else:
            keep.append(w)
    return keep, "".join(gone)[:30]


def ocr_image(img) -> OcrResult | None:
    """OCR berlapis: beberapa mode segmentasi × tingkat pembersihan derau, lalu difusi per posisi kata."""
    from PIL import ImageFilter, ImageOps

    if not available():
        return None
    prepared, notes = _prepare(img)
    # Perataan latar menolong foto (bayangan, sel diarsir) tetapi bisa merugikan scan yang sudah bersih:
    # baca keduanya dengan psm 6 lalu pakai versi yang lebih terbaca.
    reads = []
    for g in (prepared, ImageOps.autocontrast(_flatten(prepared), cutoff=1)):
        c = remove_rules(g)
        reads.append((g, c, _run(c, 6)))
    prepared, clean, _ = max(reads, key=lambda r: _quality(r[2]))
    # kedua bacaan psm 6 digabung per posisi kata (keyakinan tertinggi menang), lalu psm 11 pada versi terbaik
    passes = [r[2] for r in reads] + [_run(clean, 11)]
    fused = _fuse(passes)
    if _mean(fused) < 0.88 or len(fused) < 8:
        strong = clean.filter(ImageFilter.MedianFilter(5))
        passes += [_run(strong, 6), _run(strong, 11)]
        fused = _fuse(passes)
        notes.append("Derau terdeteksi: hasil beberapa pembacaan OCR digabung.")
    fused, dropped = _drop_giants(fused)
    if dropped:
        notes.append(f"Huruf watermark/stempel diabaikan: {dropped}")
    mean = _mean(fused)
    if fused and mean < 0.7:
        notes.append(f"Kualitas scan rendah (keyakinan OCR rata-rata {mean:.0%}). Periksa angka dengan teliti.")
    return OcrResult(fused, prepared.width, prepared.height, prepared, mean, notes)
