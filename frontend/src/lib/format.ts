// Shared formatting helpers (Indian locale: ₹ and lakhs/crores grouping).

const rupeeNumber = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const fractionalRupeeNumber = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatCurrency(amount: number, withSymbol = true): string {
  const rounded = Math.round(amount * 100) / 100
  const prefix = rounded < 0 ? '−' : ''
  const formatter = Number.isInteger(rounded) ? rupeeNumber : fractionalRupeeNumber
  return `${prefix}${withSymbol ? '₹' : ''}${formatter.format(Math.abs(rounded))}`
}

// Compact form for big numbers, e.g. ₹4.32L / ₹1.12Cr
export function formatCompact(amount: number): string {
  if (amount >= 1_00_00_000) {
    return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`
  }
  if (amount >= 1_00_000) {
    return `₹${(amount / 1_00_000).toFixed(2)}L`
  }
  return formatCurrency(amount)
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Calendar-only fields preserve the stored day in every time zone.
export function calendarDateLabel(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

export function parseCalendarDate(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match || match[3] === '0000') return
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T00:00:00.000Z`)
  if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso) return iso
}

export function formatDay(d: number): string {
  const suffix = (n: number) => {
    if (n >= 11 && n <= 13) return 'th'
    switch (n % 10) {
      case 1:
        return 'st'
      case 2:
        return 'nd'
      case 3:
        return 'rd'
      default:
        return 'th'
    }
  }
  return `${d}${suffix(d)}`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function datetimeInput(iso: string) {
  const time = new Date(iso)
  return new Date(time.valueOf() - time.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function amountInPaise(value: string) {
  const normalized = value.trim().replaceAll(',', '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [rupees, fraction = ''] = normalized.split('.')
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null
}

const indiaCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function indiaDateKey(date: Date) {
  return indiaCalendar.format(date)
}
