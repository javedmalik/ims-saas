export function money(n: number) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
export function paymentLabel(payments: { mode: string }[]) { const modes=[...new Set(payments.map(p=>p.mode))]; return modes.length===1 ? modes[0]! : "MIXED"; }
export function nextDocumentNo(prefix: string, idSeed: number | bigint) { const n=String(idSeed).padStart(6,"0"); return `${prefix}-${n}`; }
