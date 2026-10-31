export function formatMXN2(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

export const round2 = (n) => Math.round(n * 100) / 100
