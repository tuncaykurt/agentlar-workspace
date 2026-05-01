/**
 * Komisyon Hesap Motoru
 *
 * Akış:
 *   service_fee (toplam müşteriden alınan hizmet bedeli)
 *     ├─ HQ payı   = service_fee * (hq_share_rate / 100)         [markaya göre, default 9%]
 *     └─ Net (ofis+danışman) = service_fee - HQ payı
 *           ├─ Ofis payı     = Net * (office_share_rate / 100)   [default 50%]
 *           └─ Danışman payı = Net * (consultant_share_rate / 100) [default 50%]
 *               └─ co-consultant varsa danışman payından bölünür
 *
 * Notlar:
 *   - office_share_rate + consultant_share_rate = 100 olmalı (aksi halde uyarı).
 *   - co_consultant_share_rate, consultant_share_amount içinden kesilir (toplama eklenmez).
 */

export interface CommissionInput {
  service_fee: number
  hq_share_rate: number          // 0..100
  office_share_rate: number      // 0..100 (HQ sonrası kalandan)
  consultant_share_rate: number  // 0..100 (HQ sonrası kalandan)
  co_consultant_share_rate?: number // 0..100 (consultant_share içinden, opsiyonel)
}

export interface CommissionResult {
  service_fee: number
  hq_share_amount: number
  net_after_hq: number
  office_share_amount: number
  consultant_share_amount: number       // co kesintisinden ÖNCEKİ tutar
  consultant_net_amount: number         // co payı düşüldükten sonraki danışman tutarı
  co_consultant_share_amount: number
  total_check: number                   // hq + office + consultant_share_amount toplamı (= service_fee olmalı)
  warnings: string[]
}

export function calcCommission(input: CommissionInput): CommissionResult {
  const warnings: string[] = []

  const fee = num(input.service_fee)
  const hqRate = clampPct(input.hq_share_rate)
  const officeRate = clampPct(input.office_share_rate)
  const consultantRate = clampPct(input.consultant_share_rate)
  const coRate = clampPct(input.co_consultant_share_rate ?? 0)

  if (Math.abs(officeRate + consultantRate - 100) > 0.01) {
    warnings.push(
      `Ofis (%${officeRate}) + Danışman (%${consultantRate}) = %${officeRate + consultantRate} (100 olmalı).`,
    )
  }

  const hq = round2(fee * (hqRate / 100))
  const net = round2(fee - hq)
  const office = round2(net * (officeRate / 100))
  const consultantBeforeCo = round2(net * (consultantRate / 100))
  const co = round2(consultantBeforeCo * (coRate / 100))
  const consultantNet = round2(consultantBeforeCo - co)

  const total = round2(hq + office + consultantBeforeCo)
  if (Math.abs(total - fee) > 0.05) {
    warnings.push(`Toplam (${total}) ≠ hizmet bedeli (${fee}). Yuvarlama farkı kontrol edin.`)
  }

  return {
    service_fee: fee,
    hq_share_amount: hq,
    net_after_hq: net,
    office_share_amount: office,
    consultant_share_amount: consultantBeforeCo,
    consultant_net_amount: consultantNet,
    co_consultant_share_amount: co,
    total_check: total,
    warnings,
  }
}

export function formatTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(n || 0)
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function clampPct(v: unknown): number {
  const n = num(v)
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
