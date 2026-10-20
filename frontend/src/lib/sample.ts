/** Hasil kalkulasi contoh (dihasilkan oleh mesin hitung backend dari dokumen demo) untuk halaman depan. */
import type { Allocation, CalcLine } from "./types";

export const SAMPLE_LINES: CalcLine[] = [
 {
  "key": "bbm",
  "name": "BBM fosil",
  "group": "direct",
  "scope": "Scope 1",
  "activity": "1.533.400 L",
  "factor": "EF per jenis BBM × fraksi fosil",
  "formula": "E = Σ volume × fraksi fosil × EF ÷ 1000",
  "calc": "1.533.400 L × 0,60 × 2,68 ÷ 1000",
  "value_t": 2465.7,
  "source": "document"
 },
 {
  "key": "listrik",
  "name": "Listrik dibeli",
  "group": "indirect",
  "scope": "Scope 2",
  "activity": "2.400,0 MWh",
  "factor": "0,870 t CO2/MWh",
  "formula": "E = MWh dibeli × EF jaringan",
  "calc": "2.400,0 × 0,870",
  "value_t": 2088.0,
  "source": "document"
 },
 {
  "key": "pupuk_n2o",
  "name": "Pupuk — N2O",
  "group": "direct",
  "scope": "Scope 1",
  "activity": "1.450,0 t N",
  "factor": "EF1 0,010 · GWP 265",
  "formula": "E = N × EF1 × 44/28 × GWP N2O",
  "calc": "1.450,0 × 0,010 × 44/28 × 265",
  "value_t": 6038.2,
  "source": "document"
 },
 {
  "key": "pupuk_urea",
  "name": "Pupuk — urea CO2",
  "group": "direct",
  "scope": "Scope 1",
  "activity": "1.800,0 t urea",
  "factor": "0,20 t C/t",
  "formula": "E = massa urea × 0,20 × 44/12",
  "calc": "1.800,0 × 0,20 × 44/12",
  "value_t": 1320.0,
  "source": "document"
 },
 {
  "key": "pome",
  "name": "Limbah cair (POME) — CH4",
  "group": "direct",
  "scope": "Scope 1",
  "activity": "72.000 m3 · ΔCOD 45,0 kg/m3",
  "factor": "Bo 0,25 · MCF 0,80 · GWP 28",
  "formula": "E = (volume × ΔCOD × Bo × MCF ÷ 1000 − CH4 tertangkap) × GWP CH4",
  "calc": "(72.000 × 45,0 × 0,25 × 0,80 ÷ 1000 − 0,0) × 28",
  "value_t": 18144.0,
  "source": "default"
 },
 {
  "key": "lahan",
  "name": "Lahan gambut",
  "group": "direct",
  "scope": "Scope 1",
  "activity": "0,0 ha gambut",
  "factor": "40,3 t CO2/ha",
  "formula": "E = luas gambut × EF gambut",
  "calc": "0,0 × 40,3",
  "value_t": 0.0,
  "source": "document"
 },
 {
  "key": "b3",
  "name": "Limbah padat & B3",
  "group": "direct",
  "scope": "Scope 1/3",
  "activity": "18,0 t",
  "factor": "0,65 t CO2e/t",
  "formula": "E = massa × EF metode olah",
  "calc": "18,0 × 0,65",
  "value_t": 11.7,
  "source": "document"
 },
 {
  "key": "transport",
  "name": "Transportasi",
  "group": "upstream",
  "scope": "Hulu",
  "activity": "3.000.000 t-km",
  "factor": "0,10 kg/t-km",
  "formula": "E = muatan × jarak × EF moda ÷ 1000",
  "calc": "3.000.000 × 0,10 ÷ 1000",
  "value_t": 300.0,
  "source": "document"
 },
 {
  "key": "material",
  "name": "Material prekursor",
  "group": "upstream",
  "scope": "Hulu",
  "activity": "1 baris material",
  "factor": "SEE pemasok",
  "formula": "E = Σ massa material × SEE material",
  "calc": "410,0 × 1,000",
  "value_t": 410.0,
  "source": "document"
 }
];

export const SAMPLE_ALLOCATIONS: Allocation[] = [
 {
  "code": "CPO",
  "name": "Crude palm oil",
  "tonnes": 26400.0,
  "price": 12000.0,
  "share": 0.863309,
  "see_direct": 0.938183,
  "see_indirect": 0.06828,
  "see_total": 1.006462
 },
 {
  "code": "PKO",
  "name": "Palm kernel oil",
  "tonnes": 2640.0,
  "price": 19000.0,
  "share": 0.136691,
  "see_direct": 1.485456,
  "see_indirect": 0.10811,
  "see_total": 1.593566
 }
];

const NAME_EN: Record<string, string> = {
  bbm: "Fossil fuel", listrik: "Purchased electricity", pupuk_n2o: "Fertiliser — N2O", pupuk_urea: "Fertiliser — urea CO2",
  pome: "Wastewater (POME) — CH4", lahan: "Peat land", b3: "Solid & hazardous waste", transport: "Transport", material: "Precursor materials",
};

/** Baris contoh dengan nama komponen sesuai bahasa. */
export const sampleLines = (lang: "id" | "en"): CalcLine[] =>
  SAMPLE_LINES.map((l) => ({ ...l, name: lang === "en" ? NAME_EN[l.key] ?? l.name : l.name }));
