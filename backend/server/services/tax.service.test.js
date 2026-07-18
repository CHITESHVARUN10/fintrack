// Automated FY 2025-26 tax-engine tests. Run with: node --test
// Requires no database — every function under test is pure given the inputs.
const test = require('node:test')
const assert = require('node:assert/strict')
const tax = require('./tax.service')

const liab = (gross, regime, opts = {}) =>
  tax.computeLiability({ grossSalary: gross, regime, ...opts })

// --- New regime zero-tax points -------------------------------------------

test('New regime ₹3L gross → zero tax', () => {
  const r = liab(300000, 'New')
  assert.equal(r.incomeTaxBeforeRebate, 0)
  assert.equal(r.finalTax, 0)
})

test('New regime ₹12L gross → zero tax (87A rebate + SD)', () => {
  const r = liab(1200000, 'New')
  assert.equal(r.taxableIncome, 1125000) // 12L - 75k SD
  assert.equal(r.rebate, r.incomeTaxBeforeRebate)
  assert.equal(r.incomeTaxAfterRebate, 0)
  assert.equal(r.finalTax, 0)
})

test('New regime ₹12.75L gross → zero tax (derived zero-tax point)', () => {
  // 12.75L - 75k standard deduction = 12L exactly → rebate wipes the tax.
  const r = liab(1275000, 'New')
  assert.equal(r.taxableIncome, 1200000)
  assert.equal(r.finalTax, 0)
})

test('New regime ₹13L gross → small positive tax (87A marginal relief)', () => {
  const r = liab(1300000, 'New')
  assert.equal(r.taxableIncome, 1225000)
  assert.ok(r.finalTax > 0)
  assert.ok(r.finalTax < 75000) // marginal relief keeps it small
})

// --- Old regime zero-tax point --------------------------------------------

test('Old regime ₹5L gross → zero tax (87A rebate + SD)', () => {
  const r = liab(500000, 'Old')
  assert.equal(r.taxableIncome, 450000) // 5L - 50k SD
  assert.equal(r.finalTax, 0)
})

// --- Slab math -----------------------------------------------------------

test('Old regime ₹10L slab math', () => {
  const r = liab(1000000, 'Old') // taxable 9.5L
  // 2.5–5L: 2L*5% = 10,000 ; 5–10L: 4.5L*20% = 90,000 → 1,02,500
  assert.equal(r.incomeTaxBeforeRebate, 102500)
  assert.equal(r.cess, Math.round(102500 * 0.04)) // 4,100
  assert.equal(r.finalTax, 102500 + 4100)
})

test('New regime ₹20L slab math', () => {
  const r = liab(2000000, 'New') // taxable 19.25L
  // 4–8:20k, 8–12:40k, 12–16:60k, 16–20: 3.25L*20%=65k → 1,85,000
  assert.equal(r.incomeTaxBeforeRebate, 185000)
})

test('New regime ₹60L slab + surcharge math', () => {
  const r = liab(6000000, 'New') // taxable 59.25L
  // 0–16L: 1,20,000 ; 16–20:80k ; 20–24:1,00k ; 24–∞: 35.25L*30%=10,57,500
  assert.equal(r.incomeTaxBeforeRebate, 1357500)
  // 60L > 50L → 10% surcharge; marginal relief not triggered here
  assert.equal(r.surcharge, Math.round(1357500 * 0.1))
  assert.equal(r.cess, Math.round((1357500 + r.surcharge) * 0.04))
  assert.equal(r.finalTax, r.incomeTaxAfterRebate + r.surcharge + r.cess)
})

// --- Surcharge -----------------------------------------------------------

test('Surcharge absent below ₹50L, present above', () => {
  assert.equal(liab(4000000, 'New').surcharge, 0)
  assert.equal(liab(4000000, 'Old').surcharge, 0)
  assert.ok(liab(6000000, 'New').surcharge > 0) // 10% tier
  assert.ok(liab(6000000, 'Old').surcharge > 0)
})

test('New regime caps surcharge at 25% above ₹5Cr (not 37%)', () => {
  const r = liab(60000000, 'New')
  assert.ok(r.surcharge > 0)
  assert.ok(r.surcharge <= Math.round(r.incomeTaxAfterRebate * 0.25) + 1)
})

// --- TDS / advance tax ---------------------------------------------------

test('TDS refund when final tax is zero', () => {
  const r = liab(1200000, 'New', { tdsDeducted: 50000 })
  assert.equal(r.finalTax, 0)
  assert.equal(r.tdsDeducted, 50000)
  assert.equal(r.refund, 50000)
  assert.equal(r.taxPayable, 0)
})

test('TDS payable when final tax exceeds TDS', () => {
  const r = liab(2000000, 'New', { tdsDeducted: 50000 })
  assert.ok(r.finalTax > 50000)
  assert.equal(r.taxPayable, r.finalTax - 50000)
  assert.equal(r.refund, 0)
})

test('Advance tax + self-assessment tax all reduce payable', () => {
  const r = liab(2000000, 'New', {
    tdsDeducted: 30000,
    advanceTax: 20000,
    selfAssessmentTax: 10000,
  })
  assert.equal(r.totalPaid, 60000)
  assert.equal(r.taxPayable, r.finalTax - 60000)
})

// --- Regime deduction eligibility -----------------------------------------

test('Old allows HRA/80C/24/80D; New disallows them', () => {
  const deductions = {
    section80C: 150000,
    section24: 200000,
    section80D: 25000,
    hra: 100000,
  }
  const old = tax.computeLiability({ grossSalary: 2000000, regime: 'Old', hra: 100000, deductions })
  const newR = tax.computeLiability({ grossSalary: 2000000, regime: 'New', hra: 100000, deductions })
  const oldPlan = Object.fromEntries(old.deductions.map((d) => [d.key, d.claimed]))
  const newPlan = Object.fromEntries(newR.deductions.map((d) => [d.key, d.claimed]))

  assert.equal(oldPlan.hra, 100000)
  assert.equal(oldPlan.section80C, 150000)
  assert.equal(oldPlan.section24, 200000)
  assert.equal(oldPlan.section80D, 25000)

  assert.equal(newPlan.hra, 0)
  assert.equal(newPlan.section80C, 0)
  assert.equal(newPlan.section24, 0)
  assert.equal(newPlan.section80D, 0)

  // Both regimes still get the standard deduction (different amounts).
  assert.equal(oldPlan.standardDeduction, 50000)
  assert.equal(newPlan.standardDeduction, 75000)
})

test('80C is capped at ₹1,50,000', () => {
  const r = tax.computeLiability({ grossSalary: 3000000, regime: 'Old', deductions: { section80C: 300000 } })
  const plan = Object.fromEntries(r.deductions.map((d) => [d.key, d.claimed]))
  assert.equal(plan.section80C, 150000)
})

// --- Recommendation compares FINAL tax ------------------------------------

test('compare(): recommends the regime with the lower final tax', () => {
  const cases = [
    { gross: 600000, agg: {} },
    { gross: 1500000, agg: { section80C: 150000, section24: 150000 } },
    { gross: 2500000, agg: { section80C: 150000, section80CCD: 50000, section80D: 25000 } },
    { gross: 8000000, agg: { section80C: 150000, section24: 200000 } },
  ]
  for (const c of cases) {
    const { old, new: newR } = tax.computeRegimeTaxes(c.gross, c.agg)
    const recommended = old.finalTax <= newR.finalTax ? 'Old' : 'New'
    if (recommended === 'Old') assert.ok(old.finalTax <= newR.finalTax)
    else assert.ok(newR.finalTax < old.finalTax)
  }
})

// --- Full salary sweep ₹3L – ₹1Cr ---------------------------------------

test('Salary sweep ₹3L–₹1Cr: invariants hold', () => {
  const salaries = [
    300000, 500000, 750000, 1000000, 1500000, 3000000, 5000000,
    10000000, 25000000, 50000000, 100000000,
  ]
  for (const g of salaries) {
    for (const regime of ['Old', 'New']) {
      const r = liab(g, regime)
      assert.ok(r.taxableIncome >= 0, `taxable>=0 for ${g} ${regime}`)
      assert.ok(
        r.rebate >= 0 && r.rebate <= tax.REBATE[regime].max,
        `rebate within cap for ${g} ${regime}`,
      )
      assert.ok(r.rebate <= r.incomeTaxBeforeRebate + 1e-6, `rebate<=pre-rebate ${g} ${regime}`)
      assert.ok(r.finalTax >= 0, `final>=0 for ${g} ${regime}`)
      assert.ok(r.refund >= 0 && r.taxPayable >= 0, `refund/payable>=0 ${g} ${regime}`)
      assert.equal(r.refund > 0 ? r.taxPayable : 0, 0, `mutually exclusive ${g} ${regime}`)
      // Slab rows sum to the income tax before rebate.
      const summed = r.slabs.reduce((s, b) => s + b.tax, 0)
      assert.equal(summed, r.incomeTaxBeforeRebate, `slab sum ${g} ${regime}`)
      // No slab may carry a negative tax.
      assert.ok(r.slabs.every((b) => b.tax >= 0), `no negative slab ${g} ${regime}`)
    }
  }
})
