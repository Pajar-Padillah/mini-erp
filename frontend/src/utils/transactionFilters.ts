import type { TransactionFilterCondition, TransactionFilterState } from '../components/TransactionFilterBar.vue'

/** Number for values that are purely numeric (optionally "Rp", %, separators); null for codes like "FG-01". */
function asNumber(text: string): number | null {
  const t = text.replace(/rp|%|\s/gi, '')
  if (!/^-?[\d.,]+$/.test(t)) return null
  const n = Number(t.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function matchesTransactionValue(
  value: string | number | null | undefined,
  condition: TransactionFilterCondition,
): boolean {
  const query = condition.value.trim().toLowerCase()
  if (!query) return true

  const normalizedValue = String(value ?? '').trim().toLowerCase()
  if (condition.operator === 'like') return normalizedValue.includes(query)
  if (condition.operator === 'not like') return !normalizedValue.includes(query)

  const numericValue = asNumber(normalizedValue)
  const numericQuery = asNumber(query)
  const bothNumeric = numericValue !== null && numericQuery !== null
  const left = bothNumeric ? numericValue : normalizedValue
  const right = bothNumeric ? numericQuery : query

  switch (condition.operator) {
    case '=':
      return left === right
    case '!=':
      return left !== right
    case '<':
      return left < right
    case '>':
      return left > right
    case '>=':
      return left >= right
    case '<=':
      return left <= right
  }
}

export function matchesTransactionDate(
  value: string | null | undefined,
  dateRange: TransactionFilterState['dateRange'],
): boolean {
  if (!dateRange.length) return true
  const date = value?.slice(0, 10) ?? ''
  if (!date) return false
  const [from, to] = dateRange
  return (!from || date >= from) && (!to || date <= to)
}

function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function currentMonthRange(): string[] {
  const today = new Date()
  return [
    toDateString(new Date(today.getFullYear(), today.getMonth(), 1)),
    toDateString(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  ]
}
