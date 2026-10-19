/** Shared number formatting for the factory UI */

export function fmtMass(kg: number) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  if (kg >= 10) return `${kg.toFixed(1)} kg`;
  return `${kg.toFixed(2)} kg`;
}

export function fmtMoney(baht: number) {
  if (baht >= 1e6) return `฿${(baht / 1e6).toFixed(baht >= 1e7 ? 0 : 1)}M`;
  if (baht >= 1e4) return `฿${Math.round(baht / 1000)}k`;
  return `฿${Math.round(baht).toLocaleString('en-US')}`;
}

export function fmtForce(n: number) {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)} kN` : `${n.toFixed(0)} N`;
}
