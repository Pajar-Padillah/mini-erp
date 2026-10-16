// Wires a client-side list to the standard TransactionFilterBar (date range, status pills,
// secondary status pills and "field operator value" conditions), so every WMS list filters
// the same way as the rest of the app.
import { computed, ref, watch, type Ref } from 'vue'
import type { TransactionFilterOption, TransactionFilterState } from '../../components/TransactionFilterBar.vue'
import { currentMonthRange, matchesTransactionDate, matchesTransactionValue } from '../../utils/transactionFilters'

export interface ListFilterField<T> {
  label: string
  value: string
  get: (row: T) => string | number | null | undefined
}

export interface ListFilterOptions<T> {
  /** Date used by the date range; omit to hide the date picker. */
  date?: (row: T) => string | null | undefined
  /** Default date range; defaults to the current month. */
  defaultRange?: () => string[]
  /** Value matched against the selected status pills (a row may match several values). */
  status?: (row: T) => string | string[]
  /** Value matched against the selected secondary status pills. */
  secondaryStatus?: (row: T) => string | string[]
  fields: ListFilterField<T>[]
}

const asList = (v: string | string[]) => (Array.isArray(v) ? v : [v])

export function useListFilter<T>(rows: () => T[], options: ListFilterOptions<T>, page?: Ref<number>) {
  const defaults = (): TransactionFilterState => ({
    dateRange: options.date ? (options.defaultRange ?? currentMonthRange)() : [],
    status: [],
    secondaryStatus: [],
    conditions: [],
  })

  const filters = ref<TransactionFilterState>(defaults())
  const fieldOptions: TransactionFilterOption[] = options.fields.map((f) => ({ label: f.label, value: f.value }))

  const filtered = computed(() => {
    const { dateRange, status, secondaryStatus, conditions } = filters.value
    return rows().filter((row) => {
      if (options.date && !matchesTransactionDate(options.date(row), dateRange)) return false
      if (status.length && options.status && !asList(options.status(row)).some((s) => status.includes(s))) return false
      if (secondaryStatus.length && options.secondaryStatus && !asList(options.secondaryStatus(row)).some((s) => secondaryStatus.includes(s))) return false
      return conditions.every((c) => {
        const field = options.fields.find((f) => f.value === c.field)
        return !field || matchesTransactionValue(field.get(row), c)
      })
    })
  })

  function reset() {
    filters.value = defaults()
  }

  // Data is local, so "refresh" only gives visual feedback.
  const refreshing = ref(false)
  function refresh() {
    refreshing.value = true
    setTimeout(() => { refreshing.value = false }, 400)
  }

  if (page) watch(filters, () => { page.value = 1 }, { deep: true })

  return { filters, fieldOptions, filtered, reset, refresh, refreshing, hideDate: !options.date }
}
