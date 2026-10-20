"""Mesin ekstraksi berbasis tata letak.

Alur untuk setiap dokumen:
1. `build_layout` mengubah berkas menjadi kata + koordinat (lihat layout.py, ocr.py).
2. `classify_layout` menebak 1 dari 10 kategori (kata kunci berbobot + nama berkas).
3. `extract` mencari setiap field dengan beberapa strategi sekaligus:
   - TABEL   : judul kolom cocok dengan label → nilai di kolom yang sama, baris per baris
               (tabel boleh berlanjut ke halaman berikutnya; baris "Total" dipakai untuk cek silang)
   - ITEM    : baris yang memuat jenis (mis. "Biosolar B40") + angka bersatuan → satu item per baris
   - KANAN   : "Volume ..... 16.000 L"
   - BAWAH   : label di atas, nilai di bawahnya (kolom sejajar), cocok untuk formulir/kotak
   - KIRI    : "16.000 liter solar"
   - ATAS    : angka besar dengan keterangan di bawahnya
   - MATRIKS : label baris × judul kolom (mis. baris "COD" × kolom "Inlet")
   - SATUAN  : angka dengan satuan khas (kWh, m³) tanpa label, skor rendah
   Semua kandidat dinilai (kecocokan satuan, konteks uang/nomor/tanggal, rentang wajar,
   kata "total", keyakinan OCR), lalu nilai yang sama dari beberapa strategi saling menguatkan.
4. Hasil: daftar item (baris) berisi field + keyakinan + kotak sumber + alternatif.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from functools import lru_cache

from .catalog import DOC_TYPE_BY_CODE, DOC_TYPES
from .layout import DocLayout, Line, Page, Word, layout_from_text
from .rules import (
    ID_CONTEXT_RE, MONEY_BEFORE_RE, MONEY_HEADER_RE, MONTH_NAME_RE, MONTHS, N_STANDARD, NPK_GRADE_RE, RATE_AFTER_RE,
    RULES, SKIP_ROW_RE, TARGET, TOTAL_RE, TOTAL_WORD_RE, UNIT_ONLY_RE, UNIT_RE, Rule, TypeRules, product_rule, unit_info,
)

# ====================================================================== angka
def parse_number(raw: str) -> Decimal | None:
    """Angka gaya Indonesia/Inggris → Decimal.

    1.533.400 → 1533400 · 16.000,50 → 16000.50 · 1,533,400.5 → 1533400.5 · 0,72 → 0.72
    """
    s = (raw or "").strip().replace(" ", "").replace(" ", "")
    s = re.sub(r",-$", "", s)
    s = re.sub(r"[^\d.,-]", "", s)
    if not re.search(r"\d", s):
        return None
    has_dot, has_comma = "." in s, "," in s
    try:
        if has_dot and has_comma:
            if s.rfind(",") > s.rfind("."):
                s = s.replace(".", "").replace(",", ".")
            else:
                s = s.replace(",", "")
        elif has_comma:
            parts = s.split(",")
            if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3 and parts[0] not in ("0", "")):
                s = s.replace(",", "")
            else:
                s = s.replace(",", ".")
        elif has_dot:
            parts = s.split(".")
            if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3 and parts[0] not in ("0", "")):
                s = s.replace(".", "")
        return Decimal(s)
    except InvalidOperation:
        return None


_OCR_MAP = str.maketrans({"O": "0", "o": "0", "D": "0", "I": "1", "l": "1", "|": "1", "S": "5", "B": "8"})


def fix_ocr_token(tok: str) -> str:
    """Perbaiki salah baca OCR di dalam angka (O→0, l→1, S→5) tanpa menyentuh kata biasa."""
    core = tok.rstrip(".,:;")
    if re.fullmatch(r"[BbSs]\d{2}", core):
        return tok  # B40, S35: kode campuran biodiesel, bukan angka
    if len(core) >= 2 and re.fullmatch(r"[\dOoDIl|SB.,]+", core):
        digits = sum(c.isdigit() for c in core)
        if digits >= 2 and digits >= len(core) * 0.5:
            return core.translate(_OCR_MAP) + tok[len(core):]
    return tok


def plain(v: Decimal) -> str:
    s = format(v.normalize(), "f")
    return s


# ====================================================================== pandangan baris
NUM_RE = re.compile(r"\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?")
DATE_RE = re.compile(
    r"\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*(?:19|20)?\d{2}\b|\b(?:19|20)\d{2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}\b"
    r"|\b\d{1,2}\s+(?:" + MONTH_NAME_RE + r")\.?\s+(?:19|20)\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{11,}\b", re.I)
MONTH_YEAR_RE = re.compile(r"\b(?:" + MONTH_NAME_RE + r")\.?(?:\s*((?:19|20)\d{2})|\s?['`-]\s?(\d{2}))\b(?![.,]\d)", re.I)


@dataclass
class Num:
    start: int
    end: int
    raw: str
    value: Decimal
    unit_text: str
    unit_dim: str | None
    unit_factor: Decimal
    unit_end: int
    money: bool
    rate: bool
    seg: int
    words: list[Word]
    year_ctx: bool = False


@dataclass
class View:
    page: Page
    line: Line
    text: str
    low: str
    spans: list[tuple[int, int, Word, int]]       # (start, end, word, segment)
    seg_spans: list[tuple[int, int]]
    nums: list[Num] = field(default_factory=list)

    @property
    def kind(self) -> str:
        return self.page.kind

    def words_in(self, a: int, b: int) -> list[Word]:
        return [w for s, e, w, _ in self.spans if e > a and s < b]

    def seg_at(self, pos: int) -> int:
        for i, (s, e) in enumerate(self.seg_spans):
            if s <= pos < e + 1:
                return i
        return len(self.seg_spans) - 1

    def seg_text(self, i: int) -> str:
        s, e = self.seg_spans[i]
        return self.text[s:e]

    def seg_range(self, i: int) -> tuple[float, float]:
        seg = self.line.segments[i]
        return seg.x0, seg.x1


def _build_view(page: Page, line: Line) -> View:
    parts: list[str] = []
    spans = []
    seg_spans = []
    pos = 0
    for si, seg in enumerate(line.segments):
        if si:
            parts.append("   ")
            pos += 3
        s0 = pos
        for wi, w in enumerate(seg.words):
            if wi:
                parts.append(" ")
                pos += 1
            t = fix_ocr_token(w.text) if page.ocr else w.text
            spans.append((pos, pos + len(t), w, si))
            parts.append(t)
            pos += len(t)
        seg_spans.append((s0, pos))
    text = "".join(parts)
    v = View(page, line, text, text.lower(), spans, seg_spans)
    v.nums = _find_numbers(v)
    return v


def _find_numbers(v: View) -> list[Num]:
    masked = list(v.text)
    for rx in (DATE_RE, MONTH_YEAR_RE):
        for m in rx.finditer(v.text):
            if rx is MONTH_YEAR_RE:
                g = 1 if m.group(1) else 2
                a, b = m.start(g), m.end(g)
            else:
                a, b = m.start(), m.end()
            for i in range(a, b):
                masked[i] = " "
    masked_s = "".join(masked)
    out = []
    for m in NUM_RE.finditer(masked_s):
        a, b = m.start(), m.end()
        prev = v.text[a - 1] if a else " "
        prev2 = v.text[a - 2] if a > 1 else " "
        if prev.isalnum() or prev in "/@#_-" or (prev == "." and prev2.isalnum()):
            continue
        nxt = v.text[b:b + 2]
        if re.match(r"[-/]\d", nxt) or (nxt[:1].isalpha() and not UNIT_RE.match(v.text[b:b + 12])):
            # kode / rentang / tanggal (mis. 15-15-6-4, 12AB)
            continue
        value = parse_number(m.group(0))
        if value is None:
            continue
        rest = v.text[b:b + 24]
        um = UNIT_RE.match(rest)
        unit_text, dim, factor, uend = "", None, Decimal(1), b
        if um:
            unit_text = um.group("u")
            info = unit_info(unit_text)
            if info:
                dim, factor = info
                uend = b + um.end()
        money = bool(MONEY_BEFORE_RE.search(v.text[max(0, a - 6):a])) or v.text[b:b + 2] == ",-"
        rate = bool(RATE_AFTER_RE.match(v.text[uend:uend + 10]))
        seg = v.seg_at(a)
        year_ctx = bool(re.search(r"(tahun|th\.?|thn|periode|year|selama|sejak|hingga|sampai|s/d|semester|triwulan|tw|"
                                  r"q[1-4]|fy|anggaran|budget|desember|januari)\W{0,3}$", v.low[max(0, a - 14):a]))
        out.append(Num(a, b, m.group(0), value, unit_text, dim, factor, uend, money, rate, seg, v.words_in(a, uend), year_ctx))
    return out



MONTH_PATTERNS = [
    (re.compile(r"\b(" + MONTH_NAME_RE + r")\.?[\s,/'`-]*((?:19|20)\d{2})\b", re.I), "name"),
    (re.compile(r"(?<![\d/.-])(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})(?![\d/.-])"), "mm/yyyy"),
    (re.compile(r"(?<![\d/.-])((?:19|20)\d{2})\s*[/.-]\s*(0?[1-9]|1[0-2])(?:\s*[/.-]\s*\d{1,2})?(?![\d])"), "yyyy-mm"),
    (re.compile(r"(?<![\d/.-])\d{1,2}\s*[/.-]\s*(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})(?![\d])"), "date"),
]


def months_spans(text: str) -> list[tuple[int, int, int, int, str]]:
    """Semua penyebutan bulan-tahun: (tahun, bulan, awal, akhir, jenis)."""
    out = []
    taken: list[tuple[int, int]] = []
    for rx, kind in MONTH_PATTERNS:
        for m in rx.finditer(text):
            if any(a < m.end() and m.start() < b for a, b in taken):
                continue
            if kind == "name":
                mon, yr = MONTHS[m.group(1).lower()], int(m.group(2))
            elif kind == "mm/yyyy":
                mon, yr = int(m.group(1)), int(m.group(2))
            elif kind == "yyyy-mm":
                yr, mon = int(m.group(1)), int(m.group(2))
            else:
                mon, yr = int(m.group(1)), int(m.group(2))
            taken.append((m.start(), m.end()))
            out.append((yr, mon, m.start(), m.end(), kind))
    return out


def months_in(text: str) -> list[tuple[int, int]]:
    return [(y, m) for y, m, _, _, _ in months_spans(text)]

# ====================================================================== kandidat
@dataclass
class Cand:
    key: str
    value: str
    score: float
    method: str
    page: int
    words: list[Word]
    snippet: str
    unit: str = ""
    num: Decimal | None = None


@dataclass
class FieldResult:
    key: str
    value: str
    unit: str
    confidence: float
    snippet: str
    page: int | None
    bbox: dict | None
    method: str
    alternatives: list[dict] = field(default_factory=list)


@dataclass
class ExtractionResult:
    items: list[dict[str, FieldResult]]
    notes: list[str]
    meta: dict
    mode: str  # tabel | item | kunci-nilai | kosong


@lru_cache(maxsize=512)
def _rx(parts: tuple[str, ...]) -> re.Pattern | None:
    if not parts:
        return None
    return re.compile(r"(?<![a-z0-9])(?:" + "|".join(parts) + r")(?![a-z0-9])", re.I)


def _norm_key(v: Decimal | str) -> str:
    if isinstance(v, Decimal):
        return plain(v.quantize(Decimal("0.000001")))
    return re.sub(r"\s+", " ", str(v)).strip().lower()


def _combine(cands: list[Cand], layout: DocLayout) -> FieldResult | None:
    if not cands:
        return None
    groups: dict[str, list[Cand]] = {}
    for c in cands:
        groups.setdefault(_norm_key(c.num if c.num is not None else c.value), []).append(c)
    ranked = []
    for k, cs in groups.items():
        cs.sort(key=lambda c: c.score, reverse=True)
        p_not = 1.0
        for c in cs[:4]:
            p_not *= 1 - min(c.score, 0.98) * 0.92
        combined = min(0.99, max(cs[0].score, 1 - p_not))
        ranked.append((combined, cs[0], cs))
    ranked.sort(key=lambda t: t[0], reverse=True)
    best_score, best, members = ranked[0]
    conf = best_score
    if len(ranked) > 1 and ranked[1][0] >= best_score * 0.85:
        conf *= 0.8
    methods = sorted({c.method for c in members}, key=lambda m: -max(c.score for c in members if c.method == m))
    alts = []
    for sc, c, _ in ranked[1:4]:
        alts.append({"value": c.value, "unit": c.unit, "confidence": round(min(sc, 0.99), 2), "snippet": c.snippet[:160],
                     "page": c.page, "bbox": layout.bbox(c.page, c.words), "method": c.method})
    return FieldResult(best.key, best.value, best.unit, round(min(conf, 0.99), 2), best.snippet[:220], best.page,
                       layout.bbox(best.page, best.words), "+".join(methods[:3]), alts)


def _convert(rule: Rule, n: Num, inherited: tuple[str, Decimal, str] | None) -> tuple[Decimal, float, str] | None:
    """Nilai dalam satuan target field + faktor skor dari kecocokan satuan."""
    if n.money or n.rate:
        return None
    want = TARGET.get(rule.unit)
    want_dim = want[0] if want else None
    if n.unit_dim:
        if want_dim and n.unit_dim != want_dim:
            return None
        if want_dim is None and n.unit_dim == "pct" and rule.key != "ch4_fraction":
            return None
        f = 0.8 if re.match(r"sak|karung|zak|bag", n.unit_text, re.I) else 1.0
        base = n.value * n.unit_factor
        unit_label = n.unit_text
    elif inherited and (want_dim is None or inherited[0] == want_dim):
        f = 0.95
        base = n.value * inherited[1]
        unit_label = inherited[2]
    else:
        f = 0.9 if want_dim is None else (0.5 if rule.unit_required else 0.78)
        base = n.value * (want[1] if want else 1)
        unit_label = ""
    val = base / want[1] if want else n.value
    if rule.key == "ch4_fraction" and val > 1:
        val = val / 100
    if rule.rng and not (rule.rng[0] <= float(val) <= rule.rng[1]):
        f *= 0.25
    if not n.unit_dim and n.value == n.value.to_integral() and 1990 <= n.value <= 2100 and "." not in n.raw and "," not in n.raw:
        if n.year_ctx:
            return None  # "tahun 2025", "periode 2025", "s/d 2025"
        if not inherited:
            f *= 0.35  # kemungkinan tahun
    return val, f, unit_label


def _ocr_factor(words: list[Word]) -> float:
    if not words:
        return 1.0
    return 0.6 + 0.4 * min(w.conf for w in words)


def _inherited_unit(text: str) -> tuple[str, Decimal, str] | None:
    """Satuan di label/judul kolom: 'Volume (L)', 'Pemakaian kWh', 'Berat [ton]'."""
    for m in re.finditer(r"[(\[]\s*([^)\]]{1,14})\s*[)\]]", text):
        info = unit_info(m.group(1))
        if info:
            return info[0], info[1], m.group(1).strip()
    for tok in re.findall(r"[a-zA-Z³%/\-]+\d?", text):
        if tok.lower() in ("t", "l", "lt", "ha", "mt"):
            continue  # terlalu pendek untuk disimpulkan dari teks label
        info = unit_info(tok)
        if info:
            return info[0], info[1], tok
    return None


def _reject_ctx(rule: Rule, text: str) -> bool:
    rx = _rx(tuple(rule.reject))
    return bool(rx and rx.search(text))


def _avoid_factor(rule: Rule, v: View) -> float:
    rx = _rx(tuple(rule.avoid))
    return 0.45 if rx and rx.search(v.low) else 1.0


def _overlaps(a: tuple[float, float], b: tuple[float, float], kind: str) -> bool:
    if kind == "sheet":
        return int(a[0]) <= int(b[0]) < max(int(a[1]), int(a[0]) + 1) or int(b[0]) <= int(a[0]) < max(int(b[1]), int(b[0]) + 1)
    w = max(a[1] - a[0], 1.0)
    tol = w * 0.35 + (2 if kind == "text" else 6)
    return b[1] >= a[0] - tol and b[0] <= a[1] + tol


class Extractor:
    def __init__(self, layout: DocLayout, tr: TypeRules, extra_rules: list[Rule] | None = None):
        self.layout = layout
        self.tr = tr
        self.rules: list[Rule] = list(tr.rules) + list(extra_rules or [])
        self.pages: list[list[View]] = [[_build_view(p, ln) for ln in p.lines] for p in layout.pages]
        self.notes: list[str] = []
        anchors_all = tuple(a for r in self.rules for a in r.anchors)
        self._any_anchor = _rx(anchors_all)

    # ------------------------------------------------------------------ angka (kunci–nilai)
    def kv_number(self, rule: Rule) -> list[Cand]:
        cands: list[Cand] = []
        strong, weak = _rx(rule.anchors), _rx(rule.weak)
        other = _rx(tuple(a for r in self.rules if r.key != rule.key and r.kind == "number" for a in r.anchors))

        def add(v: View, n: Num, score: float, method: str, extra_words: list[Word], snippet: str | None = None,
                inherited=None, ctx_text: str = ""):
            if not n.unit_dim and not inherited and (_reject_ctx(rule, ctx_text or v.seg_text(n.seg)) or ID_CONTEXT_RE.search(ctx_text or v.seg_text(n.seg))):
                return False
            conv = _convert(rule, n, inherited)
            if conv is None:
                return False
            val, f, unit_label = conv
            s = score * f * _ocr_factor(n.words) * _avoid_factor(rule, v)
            if TOTAL_WORD_RE.search(v.low):
                s *= 1.12
            cands.append(Cand(rule.key, plain(val), min(s, 0.99), method, v.page.number, extra_words + n.words,
                              snippet or v.text, rule.unit or unit_label, val))
            return True

        def usable(n: Num) -> bool:
            return not n.money and not n.rate and not n.year_ctx

        for views in self.pages:
            for li, v in enumerate(views):
                for strength, rx in ((1.0, strong), (0.8, weak)):
                    if rx is None:
                        continue
                    for am in rx.finditer(v.low):
                        if re.search(r"(?:\bper|/|@)\s*$", v.low[max(0, am.start() - 5):am.start()]):
                            continue  # "per liter", "/kWh" = satuan harga, bukan label
                        a_seg = v.seg_at(am.start())
                        a_words = v.words_in(am.start(), am.end())
                        inherited = _inherited_unit(v.seg_text(a_seg))
                        # KANAN
                        right = [n for n in v.nums if n.start >= am.end() and usable(n)]
                        for k, n in enumerate(right[:3]):
                            between = v.low[am.end():n.start]
                            pen = 0.4 if other and other.search(between) else 1.0
                            gap_words = len([t for t in re.split(r"[\s:=.\-–>]+", between) if t and not UNIT_ONLY_RE.match(t)])
                            prox = max(0.55, 1.0 - 0.07 * gap_words - 0.12 * k)
                            add(v, n, strength * prox * pen, "kanan", a_words, inherited=inherited,
                                ctx_text=v.text[am.start():n.unit_end])
                        # KIRI
                        left = [n for n in v.nums if n.end <= am.start() and usable(n)]
                        if left:
                            n = left[-1]
                            between = v.low[n.unit_end:am.start()]
                            if len(between.split()) <= 3:
                                pen = 0.4 if other and other.search(between) else 1.0
                                add(v, n, strength * 0.62 * pen, "kiri", a_words, inherited=inherited,
                                    ctx_text=v.text[n.start:am.end()])
                        # BAWAH / ATAS (kolom sejajar)
                        if not any(n.seg == a_seg for n in right):
                            arange = v.seg_range(a_seg)
                            for direction, base, maxd in ((1, 0.9, 4), (-1, 0.55, 2)):
                                for d in range(1, maxd + 1):
                                    j = li + direction * d
                                    if j < 0 or j >= len(views):
                                        break
                                    w = views[j]
                                    if rx.search(w.low):
                                        break
                                    hit = None
                                    for n in w.nums:
                                        if usable(n) and _overlaps(arange, w.seg_range(n.seg), v.kind):
                                            hit = n
                                            break
                                    if hit:
                                        emph = 1.25 if a_words and hit.words and hit.words[0].h > 1.4 * a_words[0].h else 1.0
                                        ok = add(w, hit, strength * (base - 0.1 * (d - 1)) * emph, "bawah" if direction > 0 else "atas",
                                                 a_words if v.page is w.page and abs(d) <= 2 else [],
                                                 snippet=f"{v.text}  ↓  {w.text}" if direction > 0 else f"{w.text}  ↑  {v.text}",
                                                 inherited=inherited)
                                        if ok:
                                            break
                # SATUAN (tanpa label)
                want = TARGET.get(rule.unit)
                if want and rule.primary:
                    for n in v.nums:
                        if n.unit_dim == want[0] and not n.money and not n.rate:
                            if other and other.search(v.low) and not (strong and strong.search(v.low)):
                                continue
                            add(v, n, 0.42, "satuan", [])
        # MATRIKS
        if rule.row_label and rule.col_label:
            cands.extend(self._matrix(rule))
        return cands

    def _matrix(self, rule: Rule) -> list[Cand]:
        row_rx, col_rx = re.compile(rule.row_label, re.I), re.compile(rule.col_label, re.I)
        out = []
        for views in self.pages:
            for li, v in enumerate(views):
                if not v.line.segments or not row_rx.search(v.seg_text(0).lower()) or not v.nums:
                    continue
                for j in range(li - 1, max(-1, li - 8), -1):
                    h = views[j]
                    cols = [i for i in range(len(h.line.segments)) if col_rx.search(h.seg_text(i).lower())]
                    if not cols:
                        continue
                    centers = [s.cx for s in h.line.segments]
                    for n in v.nums:
                        cx = (n.words[0].x0 + n.words[-1].x1) / 2 if n.words else 0
                        nearest = min(range(len(centers)), key=lambda i: abs(centers[i] - cx))
                        if nearest in cols:
                            row_unit = next((unit_info(v.seg_text(i)) for i in range(len(v.line.segments))
                                             if UNIT_ONLY_RE.match(v.seg_text(i).strip())), None)
                            inh = (row_unit[0], row_unit[1], "") if row_unit else _inherited_unit(v.seg_text(0))
                            conv = _convert(rule, n, inh)
                            if conv:
                                val, f, ul = conv
                                out.append(Cand(rule.key, plain(val), 0.9 * f * _ocr_factor(n.words), "matriks",
                                                v.page.number, n.words, f"{h.text}  ↓  {v.text}", rule.unit, val))
                    break
        return out

    # ------------------------------------------------------------------ teks / enum / bulan
    def kv_text(self, rule: Rule) -> list[Cand]:
        cands: list[Cand] = []
        anchor = _rx(rule.anchors)
        val_rx = re.compile(rule.values, re.I) if rule.values else None
        primary = self.tr.primary
        prim_rx = _rx(primary.anchors) if primary else None
        for views in self.pages:
            for li, v in enumerate(views):
                am = anchor.search(v.low) if anchor else None
                if val_rx:
                    for m in val_rx.finditer(v.text):
                        if rule.kind != "enum" and not am:
                            continue
                        if am and m.start() < am.start() and rule.kind != "enum":
                            continue
                        val = re.sub(r"\s+", " ", m.group(0)).strip(" .,:;-")
                        if not val:
                            continue
                        s = 0.93 if am else 0.66
                        if prim_rx and prim_rx.search(v.low):
                            s += 0.04
                        if any(n.unit_dim for n in v.nums):
                            s += 0.03
                        cands.append(Cand(rule.key, val, min(s, 0.97) * _ocr_factor(v.words_in(m.start(), m.end())),
                                          "label" if am else "pola", v.page.number, v.words_in(m.start(), m.end()), v.text))
                    if am and rule.kind == "text" and not val_rx.search(v.text[am.end():]):
                        # nilai di bawah label
                        if li + 1 < len(views):
                            w = views[li + 1]
                            for m in val_rx.finditer(w.text):
                                if _overlaps(v.seg_range(v.seg_at(am.start())), w.seg_range(w.seg_at(m.start())), v.kind):
                                    cands.append(Cand(rule.key, m.group(0).strip(), 0.8, "bawah", w.page.number,
                                                      w.words_in(m.start(), m.end()), f"{v.text}  ↓  {w.text}"))
                elif am:
                    val, words, method, snip = self._text_after(views, li, v, am)
                    if val:
                        cands.append(Cand(rule.key, val, 0.86 if method == "kanan" else 0.74, method, v.page.number, words, snip))
        if rule.key == "supplier" and not cands:
            # nama perusahaan di kop surat (bagian atas halaman pertama)
            for v in self.pages[0][:8] if self.pages else []:
                m = re.search(rule.values or "", v.text)
                if m:
                    cands.append(Cand(rule.key, m.group(0).strip(), 0.7, "kop", v.page.number, v.words_in(m.start(), m.end()), v.text))
                    break
        return cands

    def _text_after(self, views, li, v: View, am) -> tuple[str, list[Word], str, str]:
        seg = v.seg_at(am.start())
        s_end = v.seg_spans[seg][1]
        tail = v.text[am.end():s_end].strip(" :=-–.\t")
        if len(tail) >= 2:
            return tail[:80], v.words_in(am.end(), s_end), "kanan", v.text
        if seg + 1 < len(v.seg_spans):
            t = v.seg_text(seg + 1).strip(" :=-–.")
            if t:
                a, b = v.seg_spans[seg + 1]
                return t[:80], v.words_in(a, b), "kanan", v.text
        if li + 1 < len(views):
            w = views[li + 1]
            for i in range(len(w.line.segments)):
                if _overlaps(v.seg_range(seg), w.seg_range(i), v.kind):
                    t = w.seg_text(i).strip(" :=-–.")
                    if t and not (self._any_anchor and self._any_anchor.fullmatch(t.lower())):
                        a, b = w.seg_spans[i]
                        return t[:80], w.words_in(a, b), "bawah", f"{v.text}  ↓  {w.text}"
        return "", [], "", ""

    def kv_month(self, rule: Rule) -> list[Cand]:
        cands = []
        anchor = _rx(rule.anchors)
        for views in self.pages:
            for v in views:
                am = anchor.search(v.low) if anchor else None
                for yr, mon, a, b, kind in months_spans(v.text):
                    s = 0.6 if kind != "date" else 0.45
                    if am and am.start() <= a:
                        s = 0.93 if kind != "date" else 0.7
                    s *= _avoid_factor(rule, v)
                    cands.append(Cand(rule.key, f"{yr:04d}-{mon:02d}", s, "label" if am else "pola", v.page.number,
                                      v.words_in(a, b), v.text))
            # label di atas, bulan di bawahnya (kotak formulir)
            for li, v in enumerate(views):
                am = anchor.search(v.low) if anchor else None
                if not am or months_spans(v.text[am.end():]):
                    continue
                arange = v.seg_range(v.seg_at(am.start()))
                for w in views[li + 1:li + 3]:
                    for yr, mon, a, b, kind in months_spans(w.text):
                        if _overlaps(arange, w.seg_range(w.seg_at(a)), v.kind) and kind != "date":
                            cands.append(Cand(rule.key, f"{yr:04d}-{mon:02d}", 0.9 * _avoid_factor(rule, v), "bawah",
                                              w.page.number, w.words_in(a, b), f"{v.text}  ↓  {w.text}"))
        return cands

    def field(self, rule: Rule) -> FieldResult | None:
        if rule.kind == "number":
            cands = self.kv_number(rule)
            if rule.key == "kwh_purchased":
                cands.extend(self._lwbp_wbp(rule))
        elif rule.kind == "month":
            cands = self.kv_month(rule)
        else:
            cands = self.kv_text(rule)
        return _combine(cands, self.layout)

    def _lwbp_wbp(self, rule: Rule) -> list[Cand]:
        found: dict[str, tuple[Decimal, View, Num]] = {}
        for views in self.pages:
            for v in views:
                for tag, rx in (("lwbp", r"\blwbp\b"), ("wbp", r"(?<!l)\bwbp\b")):
                    m = re.search(rx, v.low)
                    if not m or tag in found:
                        continue
                    nums = [n for n in v.nums if n.start > m.end() and not n.money and (n.unit_dim in (None, "energy"))]
                    nums = [n for n in nums if not re.search(r"stand|awal|akhir", v.low[m.end():n.start])]
                    if nums:
                        n = nums[-1] if len(nums) > 1 and not nums[0].unit_dim else nums[0]
                        found[tag] = (n.value * n.unit_factor, v, n)
        if len(found) == 2:
            total = found["lwbp"][0] + found["wbp"][0]
            v = found["lwbp"][1]
            return [Cand(rule.key, plain(total), 0.82, "LWBP+WBP", v.page.number,
                         found["lwbp"][2].words + found["wbp"][2].words, f"LWBP + WBP = {plain(total)} kWh", "kWh", total)]
        return []

    # ------------------------------------------------------------------ tabel
    def tables(self) -> tuple[list[dict[str, FieldResult]], dict[str, Decimal], str]:
        self.table_keys: set[str] = set()
        best: dict | None = None
        groups: dict[tuple, dict] = {}
        for views in self.pages:
            for li, v in enumerate(views):
                hit = self._table_at(views, li)
                if not hit:
                    continue
                sig = tuple(sorted(hit["mapping"].values()))
                g = groups.setdefault(sig, {"rows": [], "totals": {}, "score": 0.0, "pages": set(), "keys": set(sig)})
                g["rows"].extend(hit["rows"])
                g["totals"].update(hit["totals"])
                g["score"] += hit["score"]
                g["pages"].add(v.page.number)
        for sig, g in groups.items():
            if g["rows"] and (best is None or g["score"] > best["score"]):
                best = g
        if not best:
            return [], {}, ""
        self.table_keys = best["keys"]
        desc = f"tabel ({len(best['rows'])} baris" + (f", {len(best['pages'])} halaman" if len(best["pages"]) > 1 else "") + ")"
        return best["rows"], best["totals"], desc

    def _map_header(self, v: View) -> dict[int, str]:
        mapping: dict[int, tuple[str, float, int]] = {}
        for si in range(len(v.line.segments)):
            st = v.seg_text(si).lower()
            if sum(c.isdigit() for c in st) > len(st) * 0.4 or len(st) > 60:
                continue
            for rule in self.rules:
                if rule.row_label:
                    continue
                for strength, rx in ((1.0, _rx(rule.anchors)), (0.6, _rx(rule.weak))):
                    m = rx.search(st) if rx else None
                    if not m:
                        continue
                    if rule.kind == "number" and MONEY_HEADER_RE.search(st) and not _inherited_unit(st):
                        continue
                    sc = strength + 0.01 * len(m.group(0))
                    if si not in mapping or sc > mapping[si][1]:
                        mapping[si] = (rule.key, sc, m.end() - m.start())
                    break
        # satu rule hanya untuk satu kolom: ambil kolom terkuat (yang ber-satuan didahulukan nanti)
        by_rule: dict[str, list[int]] = {}
        for si, (k, sc, _) in mapping.items():
            by_rule.setdefault(k, []).append(si)
        out = {}
        for k, cols in by_rule.items():
            cols.sort(key=lambda si: (-(_inherited_unit(v.seg_text(si)) is not None), -mapping[si][1]))
            out[cols[0]] = k
        return out

    def _table_at(self, views: list[View], li: int) -> dict | None:
        h = views[li]
        if len(h.line.segments) < 2:
            return None
        if any(n.unit_dim for n in h.nums) or sum(1 for i in range(len(h.line.segments))
                                                    if re.search(r"[a-zA-Z]{2,}", h.seg_text(i))) < 2:
            return None  # baris berisi nilai, bukan judul kolom
        if sum(1 for n in h.nums if not n.year_ctx) > len(h.line.segments) // 2:
            return None
        mapping = self._map_header(h)
        numeric = [k for k in mapping.values() if (r := self._rule(k)) and r.kind == "number"]
        if not numeric:
            return None
        if len(mapping) < 2 and len(h.line.segments) < 3:
            return None
        heads = [(sg.x0, sg.x1) for sg in h.line.segments]
        units: dict[int, tuple[str, Decimal, str] | None] = {si: _inherited_unit(h.seg_text(si)) for si in range(len(heads))}
        unit_col = next((si for si in range(len(heads)) if re.fullmatch(r"\s*(satuan|unit|uom|sat\.?)\s*", h.seg_text(si).lower())), None)
        kind = h.kind

        def band(x0: float, x1: float) -> int:
            def key(i: int):
                a, b = heads[i]
                if kind == "sheet":
                    return (0 if int(a) <= x0 < max(b, a + 1) else 1, abs(a - x0))
                ov = min(b, x1) - max(a, x0)
                dist = 0 if ov > 0 else min(abs(x0 - b), abs(a - x1))
                return (-max(ov, 0), dist, abs(a - x0))
            return min(range(len(heads)), key=key)

        rows, totals = [], {}
        start = li + 1
        if start < len(views):
            sub = views[start]
            cells = self._cells(sub, band, len(heads))
            nonempty = [c for c in cells if c[0].strip()]
            if nonempty and all(UNIT_ONLY_RE.match(c[0].strip()) for c in nonempty):
                for i, (t, _) in enumerate(cells):
                    inf = unit_info(t) if t.strip() else None
                    if inf and not units.get(i):
                        units[i] = (inf[0], inf[1], t.strip("()[] "))
                start += 1
        gap_limit = 2 if h.kind == "sheet" else None
        prev_y = h.line.y1
        med_h = (h.line.y1 - h.line.y0) or 1
        misses = 0
        for j in range(start, len(views)):
            r = views[j]
            gap = r.line.y0 - prev_y
            if (gap_limit is not None and gap > gap_limit) or (gap_limit is None and gap > med_h * 4):
                break
            prev_y = r.line.y1
            cells = self._cells(r, band, len(heads))
            first = next((t for t, _ in cells if t.strip()), "")
            if not r.nums:
                misses += 1
                if misses >= 2:
                    break
                continue
            if self._map_header(r) and sum(1 for t, _ in cells if t.strip()) >= 2 and len(self._map_header(r)) >= len(mapping) - 1 and not any(n.unit_dim for n in r.nums):
                continue  # judul berulang
            misses = 0
            if SKIP_ROW_RE.match(first):
                continue
            item: dict[str, FieldResult] = {}
            for si, key in mapping.items():
                rule = self._rule(key)
                text, words = cells[si]
                if not text.strip():
                    continue
                fr = self._cell_value(rule, r, text, words, units.get(si),
                                      cells[unit_col][0] if unit_col is not None else "", h)
                if fr:
                    item[key] = fr
            if TOTAL_RE.match(first) and not (SKIP_ROW_RE.match(first)):
                for k, fr in item.items():
                    if self._rule(k).kind == "number":
                        totals[k] = Decimal(fr.value)
                break
            prim = self.tr.primary
            if prim and prim.key in mapping.values() and prim.key not in item:
                continue
            if item:
                rows.append(item)
        if not rows or (len(rows) == 1 and len(rows[0]) < 2):
            return None
        score = len(mapping) + 0.5 * len(rows) + (1 if self.tr.primary and self.tr.primary.key in mapping.values() else 0)
        return {"mapping": mapping, "rows": rows, "totals": totals, "score": score}

    def _cells(self, v: View, band, n: int) -> list[tuple[str, list[Word]]]:
        """Tetapkan setiap segmen baris ke kolom judul; segmen berisi ≥2 angka dipecah per kata."""
        cells: list[list[tuple[int, Word, str]]] = [[] for _ in range(n)]
        for si, seg in enumerate(v.line.segments):
            toks = [(s, w, v.text[s:e]) for s, e, w, sg in v.spans if sg == si]
            numeric = [t for t in toks if re.fullmatch(r"[\d.,]+", t[2])]
            col = band(seg.x0, seg.x1)
            if len(numeric) >= 2:
                per = {band(w.x0, w.x1) for _, w, _ in numeric}
                if len(per) > 1:
                    for t in toks:
                        cells[band(t[1].x0, t[1].x1)].append(t)
                    continue
            cells[col].extend(toks)
        return [(" ".join(t for _, _, t in c), [w for _, w, _ in c]) for c in cells]

    def _cell_value(self, rule: Rule, v: View, text: str, words: list[Word], col_unit, unit_cell: str, header: View):
        if rule.kind == "number":
            cell_nums = [n for n in v.nums if any(w in words for w in n.words)]
            inherited = col_unit
            if unit_cell.strip():
                inf = unit_info(unit_cell)
                if inf:
                    inherited = (inf[0], inf[1], unit_cell.strip())
            for n in cell_nums:
                conv = _convert(rule, n, inherited)
                if conv:
                    val, f, ul = conv
                    conf = 0.95 * f * _ocr_factor(n.words)
                    return FieldResult(rule.key, plain(val), rule.unit or ul, round(min(conf, 0.99), 2),
                                       f"{header.text}  ↓  {v.text}"[:220], v.page.number,
                                       self.layout.bbox(v.page.number, n.words), "tabel")
            return None
        if rule.kind == "month":
            found = months_in(text)
            if not found:
                return None
            yr, mon = found[0]
            return FieldResult(rule.key, f"{yr:04d}-{mon:02d}", "", 0.93, f"{header.text}  ↓  {v.text}"[:220],
                               v.page.number, self.layout.bbox(v.page.number, words), "tabel")
        val = text.strip(" :-–")
        if rule.values:
            m = re.search(rule.values, text, re.I)
            if m:
                val = m.group(0)
            elif rule.kind == "enum":
                val = val  # teks bebas pada kolom jenis tetap disimpan
        if not val:
            return None
        return FieldResult(rule.key, re.sub(r"\s+", " ", val)[:80], "", 0.92 if rule.values and re.search(rule.values, text, re.I) else 0.8,
                           f"{header.text}  ↓  {v.text}"[:220], v.page.number, self.layout.bbox(v.page.number, words), "tabel")

    def _rule(self, key: str) -> Rule | None:
        return next((r for r in self.rules if r.key == key), None)

    # ------------------------------------------------------------------ item per baris (tanpa tabel)
    def line_items(self) -> tuple[list[dict[str, FieldResult]], dict[str, Decimal]]:
        if not self.tr.item_enum or not self.tr.primary:
            return [], {}
        enum_rule, prim = self.tr.get(self.tr.item_enum), self.tr.primary
        rx = re.compile(enum_rule.values, re.I)
        rows, totals = [], {}
        for views in self.pages:
            for v in views:
                m = rx.search(v.text)
                nums = [n for n in v.nums if n.start > (m.end() if m else 0)]
                conv = None
                for n in nums:
                    if n.unit_dim and _convert(prim, n, None):
                        conv = (n, _convert(prim, n, None))
                        break
                if not conv:
                    continue
                n, (val, f, ul) = conv
                fr = FieldResult(prim.key, plain(val), prim.unit, round(min(0.9 * f * _ocr_factor(n.words), 0.99), 2), v.text,
                                 v.page.number, self.layout.bbox(v.page.number, n.words), "baris")
                if TOTAL_WORD_RE.search(v.low) and not m:
                    totals[prim.key] = val
                    continue
                if not m:
                    continue
                item = {prim.key: fr, enum_rule.key: FieldResult(
                    enum_rule.key, re.sub(r"\s+", " ", m.group(0)).strip(), "", 0.9, v.text, v.page.number,
                    self.layout.bbox(v.page.number, v.words_in(m.start(), m.end())), "baris")}
                rows.append(item)
        if len(rows) < 2:
            return [], {}
        return rows, totals

    # ------------------------------------------------------------------ utama
    def run(self) -> ExtractionResult:
        notes = list(self.layout.warnings)
        rows, totals, desc = self.tables()
        mode = "tabel" if rows else ""
        if not rows:
            rows, totals = self.line_items()
            mode = "item" if rows else ""
        single = not rows
        doc_level: dict[str, FieldResult] = {}
        for rule in self.rules:
            if not single and all(rule.key in r for r in rows):
                continue
            fr = self.field(rule)
            if fr:
                doc_level[rule.key] = fr
        if single:
            items = [doc_level] if doc_level else []
            mode = "kunci-nilai" if doc_level else "kosong"
        else:
            items = rows
            if desc:
                notes.append(f"Data dibaca dari {desc}.")
            elif mode == "item":
                notes.append(f"Ditemukan {len(rows)} item pada dokumen.")
            for key, fr in doc_level.items():
                rule = self._rule(key)
                if not rule.item:
                    items[0].setdefault(key, fr)
                    continue
                if rule.kind == "number" and rule.primary:
                    continue
                if key in getattr(self, "table_keys", set()):
                    continue  # kolomnya ada di tabel tetapi sel kosong → jangan diisi dari bagian lain
                for it in items:
                    if key not in it:
                        it[key] = FieldResult(fr.key, fr.value, fr.unit, round(fr.confidence * 0.92, 2), fr.snippet, fr.page,
                                              fr.bbox, fr.method + "+dokumen", fr.alternatives)
            prim = self.tr.primary
            if prim and prim.key in totals:
                s = sum((Decimal(it[prim.key].value) for it in items if prim.key in it), Decimal(0))
                t = totals[prim.key]
                if t and abs(s - t) / t > Decimal("0.005"):
                    notes.append(f"Jumlah baris ({plain(s)}) berbeda dengan total dokumen ({plain(t)}). Periksa baris yang terlewat.")
                    for it in items:
                        if prim.key in it:
                            it[prim.key].confidence = round(it[prim.key].confidence * 0.8, 2)
                else:
                    notes.append(f"Total baris cocok dengan total dokumen ({plain(t)}).")
        self._post(items, notes)
        meta = document_meta(self.layout)
        return ExtractionResult(items, notes, meta, mode)

    def _post(self, items: list[dict[str, FieldResult]], notes: list[str]) -> None:
        for it in items:
            ft = it.get("fuel_type")
            if ft:
                v = re.sub(r"b[i1l!]o\s*-?\s*s[o0]lar", "Biosolar", ft.value, flags=re.I)
                v = re.sub(r"\bb\s?(\d{2})\b", lambda m: "B" + m.group(1), v, flags=re.I)
                ft.value = re.sub(r"\s+", " ", v).strip()
        if self.tr.code == "pupuk":
            for it in items:
                ft = it.get("fertilizer_type")
                if "n_content_pct" in it or not ft:
                    continue
                m = NPK_GRADE_RE.search(ft.value) or NPK_GRADE_RE.search(ft.snippet)
                val = None
                if m:
                    val, conf, why = Decimal(m.group(1)), 0.85, "dari grade NPK"
                else:
                    for rx, n in N_STANDARD:
                        if rx.search(ft.value):
                            val, conf, why = n, 0.75, "kadar N standar"
                            break
                if val is not None:
                    it["n_content_pct"] = FieldResult("n_content_pct", plain(val), "%", conf, f"{ft.value} → {why}",
                                                      ft.page, ft.bbox, why)
            for it in items:
                mk = it.get("mass_kg")
                if mk and re.search(r"sak|karung|zak|bag", mk.snippet, re.I):
                    notes.append("Satuan sak/karung dikonversi dengan asumsi 50 kg per sak. Koreksi bila berbeda.")
                    break


def _type_rules(type_code: str) -> TypeRules | None:
    return RULES.get(type_code)


def extract(layout: DocLayout, type_code: str, products: list[tuple[str, str]] | None = None) -> ExtractionResult:
    tr = _type_rules(type_code)
    if not tr:
        return ExtractionResult([], [f"Kategori {type_code} tidak dikenal"], {}, "kosong")
    extra = []
    if type_code == "produksi":
        for code, name in products or []:
            if code.upper() not in ("CPO", "PKO"):
                extra.append(product_rule(code, name))
    ex = Extractor(layout, tr, extra)
    res = ex.run()
    # produk tambahan → product_code / product_t (struktur katalog)
    for it in res.items:
        for r in extra:
            if r.key in it:
                fr = it.pop(r.key)
                if "product_t" not in it:
                    it["product_code"] = FieldResult("product_code", r.key[:-2].upper(), "", fr.confidence, fr.snippet, fr.page, fr.bbox, fr.method)
                    it["product_t"] = FieldResult("product_t", fr.value, "t", fr.confidence, fr.snippet, fr.page, fr.bbox, fr.method, fr.alternatives)
    return res


# ====================================================================== klasifikasi
def classify_ranked(text: str, filename: str = "") -> list[tuple[str, float]]:
    name = filename.lower().replace("_", " ").replace("-", " ")
    body = (text or "").lower()
    scores: dict[str, float] = {}
    for code, tr in RULES.items():
        s = 0.0
        for pat, w in tr.hints:
            n_body = len(re.findall(pat, body))
            if n_body:
                s += w * (1 + min(n_body - 1, 4) * 0.25)
            if re.search(pat, name):
                s += w * 1.2
        dt = DOC_TYPE_BY_CODE.get(code)
        for kw in dt.keywords if dt else ():
            if re.search(r"\b" + re.escape(kw) + r"\b", name):
                s += 0.8
        if s:
            scores[code] = s
    total = sum(scores.values()) or 1
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    out = []
    for i, (code, s) in enumerate(ranked):
        margin = (s - ranked[1][1]) / s if i == 0 and len(ranked) > 1 else 1.0
        conf = min(0.99, 0.45 + 0.08 * s) * (0.75 + 0.25 * min(1.0, margin * 2)) if i == 0 else s / total
        out.append((code, round(conf, 2)))
    return out


def classify(text: str, filename: str = "") -> tuple[str | None, float]:
    r = classify_ranked(text, filename)
    return r[0] if r else (None, 0.0)


def classify_layout(layout: DocLayout, filename: str = "") -> tuple[str | None, float]:
    return classify(layout.text, filename)


# ====================================================================== metadata dokumen
def document_meta(layout: DocLayout) -> dict:
    meta: dict[str, str] = {}
    views = [_build_view(p, ln) for p in layout.pages[:2] for ln in p.lines]
    num_rxs = [
        re.compile(r"(?:no\.?|nomor|nomer|invoice|faktur|manifest)\s*(?:[a-z.]+\s*){0,2}[:#]\s*([A-Z0-9][A-Z0-9/\-.]{3,40})", re.I),
        re.compile(r"\b(?:no\.?|nomor|invoice)\s+([A-Z0-9]*\d[A-Z0-9/\-.]{3,40})", re.I),
    ]
    for v in views:
        for rx in num_rxs:
            m = rx.search(v.text)
            if m and re.search(r"\d", m.group(1)) and not re.search(r"pelanggan|rekening|npwp|telp|hp|kode\s*pos",
                                                                    v.low[max(0, m.start() - 4):m.start(1)]):
                meta["doc_number"] = m.group(1).strip(".")
                break
        if "doc_number" in meta:
            break
    for v in views[:12]:
        m = re.search(r"\b((?:PT|CV|UD|KUD|Koperasi)\.?\s+[A-Z][\w .&,'-]{2,60})", v.text)
        if m:
            meta["supplier"] = re.split(r"\s{2,}", m.group(1).strip())[0].strip(" ,.")
            break
    for v in views:
        m = re.search(r"\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*((?:19|20)\d{2})\b", v.text)
        if m and 1 <= int(m.group(2)) <= 12 and 1 <= int(m.group(1)) <= 31:
            meta["doc_date"] = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
            break
        m = re.search(r"\b(\d{1,2})\s+(" + MONTH_NAME_RE + r")\.?\s+((?:19|20)\d{2})\b", v.text, re.I)
        if m:
            meta["doc_date"] = f"{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
            break
    return meta


# ====================================================================== kompatibilitas (teks polos)
@dataclass
class ExtractedText:
    text: str
    pages: list[str]
    method: str


@dataclass
class FieldCandidate:
    key: str
    value: str
    unit: str
    confidence: float
    snippet: str
    page: int | None = None


def extract_fields(type_code: str, ext: ExtractedText, product_codes: list[str] | None = None) -> list[FieldCandidate]:
    """Pembungkus lama: teks polos → field item pertama."""
    res = extract(layout_from_text(ext.text), type_code, [(c, c) for c in product_codes or []])
    if not res.items:
        return []
    return [FieldCandidate(f.key, f.value, f.unit, f.confidence, f.snippet, f.page) for f in res.items[0].values()]


def field_label(type_code: str, key: str) -> str:
    dt = DOC_TYPE_BY_CODE.get(type_code)
    spec = dt.field(key) if dt else None
    return spec.label if spec else key


__all__ = ["parse_number", "extract", "classify", "classify_ranked", "classify_layout", "document_meta",
           "ExtractionResult", "FieldResult", "DOC_TYPES"]
