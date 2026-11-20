const nf = new Intl.NumberFormat("tr-TR");

export const formatNumber = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));

export function formatLength(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} Mb`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kb`;
  return `${nf.format(n)} baz`;
}

export function niceStep(span: number, targetTicks = 8): number {
  const raw = span / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10;
  return nice * pow;
}
