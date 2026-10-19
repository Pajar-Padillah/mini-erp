// Fixed-point decimals for the mock backend (stand-in for shopspring/decimal + Postgres NUMERIC).
// Values are bigints scaled by 10^6; qty (3 dp) x price (2 dp) multiplies exactly.

export type Dec = bigint

const SCALE = 6
const ONE = 10n ** BigInt(SCALE)

export const ZERO: Dec = 0n

/** Parses a decimal string/number; returns null when it is not a plain decimal. */
export function parseDec(input: unknown): Dec | null {
  let s: string
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    s = input.toFixed(SCALE + 1)
  } else if (typeof input === 'string') {
    s = input.trim()
  } else {
    return null
  }
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m || (!m[2] && !m[3])) return null
  const frac = (m[3] ?? '').padEnd(SCALE + 1, '0').slice(0, SCALE + 1)
  const raw = BigInt((m[2] || '0') + frac)
  const v = (raw + 5n) / 10n
  return m[1] === '-' ? -v : v
}

/** Like parseDec but treats anything unparsable as zero (for values read back from storage). */
export function dec(input: unknown): Dec {
  return parseDec(input) ?? ZERO
}

/** Rounds half away from zero to `dp` decimal places, like a NUMERIC(18,dp) column. */
export function roundDec(v: Dec, dp: number): Dec {
  const factor = 10n ** BigInt(SCALE - dp)
  const abs = v < 0n ? -v : v
  const rounded = ((abs + factor / 2n) / factor) * factor
  return v < 0n ? -rounded : rounded
}

export function mulDec(a: Dec, b: Dec): Dec {
  const p = a * b
  const abs = p < 0n ? -p : p
  const q = (abs + ONE / 2n) / ONE
  return p < 0n ? -q : q
}

/** Formats like shopspring's Decimal.String(): no trailing zeros, no exponent. */
export function formatDec(v: Dec): string {
  const neg = v < 0n
  const abs = neg ? -v : v
  const int = (abs / ONE).toString()
  const frac = (abs % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '')
  const out = frac ? `${int}.${frac}` : int
  return neg && abs !== 0n ? `-${out}` : out
}

export function sumDec(values: Dec[]): Dec {
  return values.reduce((a, b) => a + b, ZERO)
}
