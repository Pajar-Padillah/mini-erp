// Request plumbing for the in-browser mock backend (see mockDb.ts). There is no HTTP: each
// *Api call runs its handler locally after a short delay and returns a JSON copy of the
// result, so callers behave exactly as they did against the Go API.
import { useCompanyStore } from '../stores/companyStore'

/** Error raised by the mock backend; `message` is what the Go API returned in `{ "error": ... }`. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

/** The company the old X-Company-ID header carried; 0 when none is selected. */
export function currentCompanyId(): number {
  return useCompanyStore().selectedCompanyId || 0
}

const MIN_LATENCY_MS = 100
const MAX_LATENCY_MS = 200

/** Runs a mock handler after a small delay so loading states still show. */
export async function mockRequest<T>(handler: () => T): Promise<T> {
  const ms = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS)
  await new Promise((resolve) => setTimeout(resolve, ms))
  const result = handler()
  // Same isolation as a network round-trip: callers never hold references into the store.
  return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T)
}
