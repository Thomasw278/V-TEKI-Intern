/**
 * Garis kontur topografi (peta kebun) sebagai latar. Bentuknya deterministik,
 * jadi sama setiap kali dirender dan tidak memicu perbedaan hidrasi.
 */
export function Contours({ className, rings = 9, animate = false }: { className?: string; rings?: number; animate?: boolean }) {
  const paths: string[] = [];
  const cx = 820, cy = 620;
  for (let r = 0; r < rings; r++) {
    const base = 120 + r * 78;
    const pts: string[] = [];
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = Math.sin(a * 3 + r * 0.7) * (14 + r * 3) + Math.cos(a * 5 - r) * (8 + r * 1.5) + Math.sin(a * 2 + r * 1.9) * 22;
      const rx = (base + wob) * 1.35;
      const ry = base + wob * 0.8;
      pts.push(`${(cx + Math.cos(a) * rx).toFixed(1)},${(cy + Math.sin(a) * ry).toFixed(1)}`);
    }
    paths.push(`M${pts.join(" L")}Z`);
  }
  return (
    <svg className={className} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#C8F05A" strokeWidth={i % 3 === 0 ? 1.4 : 0.8}
          style={animate ? { animationDelay: `${i * 0.12}s` } : undefined} />
      ))}
    </svg>
  );
}
