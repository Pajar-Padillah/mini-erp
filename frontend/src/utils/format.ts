export function formatMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

export function formatQty(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n)
}

/** "2026-10-11" / ISO timestamp → "11 Oct 2026"; empty → "-". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
