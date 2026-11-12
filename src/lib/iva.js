import { round2 } from './format'

export const TASA_IVA_DEFAULT = 0.16

// 0 es una tasa válida (0%); solo null/undefined/''/NaN caen al default
export function tasaIva(contrato) {
  const v = contrato?.tasa_iva
  if (v === null || v === undefined || v === '') return TASA_IVA_DEFAULT
  const n = Number(v)
  return Number.isFinite(n) ? n : TASA_IVA_DEFAULT
}

export const calcIva = (base, contrato) => round2(base * tasaIva(contrato))

export const etiquetaIva = (contrato) => `IVA ${Math.round(tasaIva(contrato) * 100)}%`
