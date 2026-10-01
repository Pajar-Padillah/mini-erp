function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const n = Number.parseInt(clean, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Mixes `hex` toward `mixHex` by `weight` (0-1), matching Element Plus's tint/shade formula. */
export function mix(hex: string, mixHex: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hex)
  const [r2, g2, b2] = hexToRgb(mixHex)
  return rgbToHex(
    r1 + (r2 - r1) * weight,
    g1 + (g2 - g1) * weight,
    b1 + (b2 - b1) * weight,
  )
}

export function tint(hex: string, weight: number): string {
  return mix(hex, '#ffffff', weight)
}

export function shade(hex: string, weight: number): string {
  return mix(hex, '#000000', weight)
}

export function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
