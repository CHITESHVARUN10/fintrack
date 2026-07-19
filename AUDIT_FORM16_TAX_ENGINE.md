# Form 16 OCR → Tax Recommendation Architecture Audit

Audit date: 2026-07-19  
Scope: current working tree only. No application code was changed for this audit.

## Executive summary

The repository contains a promising canonical engine in `backend/server/services/taxEngine.service.js`, but it is not yet the sole source of truth. The upload/review/recommendation path calls it, while `/api/tax/*`, the Form 16 review preview, and recommendation-page helpers retain separate calculations. The result is a real risk that a user can see a number calculated by a different rule than the saved recommendation.

The seven requested salary-only scenarios produce internally consistent results in the canonical engine when run with FY `2025-26`, no optional deductions, and zero TDS. The architecture nevertheless fails several required business controls, notably complete deduction metadata, audited merge history, education-tuition double counting, handling of 24(b)/80G/80CCD, and deterministic-only recommendation text.

## 1. Existing end-to-end pipeline

```text
PDF upload
  POST /api/form16/upload  (backend/server/routes/form16/form16.routes.js)
    -> extractForm16(pdfBase64) (services/gemini.service.js)
    -> normalizeForm16(raw object)
    -> Form16 Mongo document (models/form16.model.js)

Review UI
  Form16Processing -> Form16Review
    -> frontend TaxpayerContext.fromForm16(record)
    -> GET /api/form16/:id/deductions-preview
    -> aggregateDeductions + fromForm16(form16, recordsAgg, eduTuition)
    -> replace browser context deductions
    -> PATCH finalizedDeductions, then PUT Form 16 fields

Recommendation
  GET /api/form16/:id/recommendation
    -> cache check: TaxRecommendation where isStale=false
    -> aggregateDeductions + EducationPayment annualisation
    -> generateRecommendation
    -> backend fromForm16 -> validateTaxpayerContext -> computeTax (old/new)
    -> Gemini narrative attempt, deterministic fallback
    -> TaxRecommendation Mongo document
    -> frontend API adapter -> TaxRecommendation page / regime waterfalls
```

### 1.1 Stage inventory

| Stage | Inputs | Outputs / mutations | Files and functions | Caching / duplication |
|---|---|---|---|---|
| PDF upload | PDF in memory, authenticated user | Deletes Form 16s for user/FY; writes replacement `Form16` | `form16.routes.js`: `POST /upload`, `resetTaxpayerContext`; `gemini.service.js`: `extractForm16`, `normalizeForm16` | Deletes before `findOneAndReplace`; old recommendation can be orphaned. |
| OCR | Base64 PDF, `GEMINI_API_KEY` | Gemini JSON; test-only mock | `gemini.service.js`: `callGemini`, `extractForm16` | Raw response is only console logged when `DEBUG_OCR=true`; no durable audit record. |
| Normalisation | Parsed OCR object | Numeric Form 16 fields coerced; invalid/missing values become `null` | `normalizeForm16`, `coerceNumber` | Mutates its supplied object. It does not preserve raw OCR payload or per-field confidence. |
| Form 16 persistence | Normalised object | Flat Mongo `Form16` fields | `models/form16.model.js` | `taxpayerContext` exists in schema but is never stored or read as the canonical context. |
| Supplemental-record aggregation | Investments, insurance, loans, education documents | Six section totals | `tax.service.js`: `aggregateDeductions`, `annualize` | Reads all user records, with no financial-year, status, evidence, or origin-file filtering. It is also used by separate `/api/tax/*` calculations. |
| Canonical context construction | Form 16, aggregate totals, separate education total | `{ salary, deductions, metadata, financialYear }` | `taxEngine.service.js`: `fromForm16`, `makeLineItem` | Rebuilt in preview and recommendation. The browser has a third, non-identical `fromForm16`. |
| Merge | One Form 16 value and one aggregate record value per section | Primary item plus duplicate-risk secondary item | `taxEngine.service.js`: `fromForm16` loop | Higher amount wins (ties prefer Form 16). Aggregate input means individual record provenance is lost. Education is added twice. |
| Validation | Context | errors/warnings/status | `validateTaxpayerContext`, `filterValidDeductions` | Does not produce a validated immutable context; it only reports. Zero/negative items are silently removed rather than retained with explicit status. |
| Old/New calculation | Context | `TaxResult`, per-regime waterfall and trace | `computeTax`, `computeRegimeResult`, `compute87ARebate`, `computeSurcharge`, `toRegimeTrace` | `computeTax` mutates `ctx.computedIncome`; it is not pure despite the documented claim. |
| Narrative/recommendation | `TaxResult`, deductions | recommendation, suggestions, cache record | `gemini.service.js`: `generateRecommendation`; `TaxRecommendation` model | Gemini may author explanation and suggestions. Cached when `isStale=false`. |
| UI | Recommendation plus Form 16 fetch | Regime cards, suggestions, trace table, PDF | `frontend/src/services/api.ts`, `TaxRecommendation.tsx` | Browser has separate tax/preview/suggestion functions and hardcoded tax constants. |

### 1.2 Secondary tax paths (not the Form 16 canonical path)

`backend/server/services/tax.service.js` implements `computeLiability` and `computeRegimeTaxes`; `backend/server/routes/tax/tax.routes.js` exposes them at `/api/tax/estimate`, `/calculate`, and `/compare`. `frontend/src/lib/tax.ts` implements yet another slab and preview calculator. These paths do not share a common typed result contract with `taxEngine.service.js`.

## 2. Required value tracing

All arrows below describe the current implementation—not the intended target design.

| Value | Raw OCR / Form 16 field | Normalised / stored | Merge and validation | Applied / excluded | UI |
|---|---|---|---|---|---|
| Gross salary | `grossSalary` requested from Gemini | `Form16.grossSalary` number/null | copied to `ctx.salary.grossSalary`; components are summed only for mismatch validation | calculation uses the explicit gross; if absent it blocks (despite source label `COMPONENT_SUM`) | Review shows context gross; recommendation uses `grossSalaryUsed`. |
| Basic, HRA, special, other, LTA | individual Gemini fields | flat Form 16 numbers/null | `componentSum` is calculated; mismatch > ₹500 produces validation error but is non-blocking | Basic/special/other do not enter tax. HRA becomes old-regime exemption only if `rentPaid` exists. LTA is wholly exempted in old regime when positive. | Components and gross on Review; HRA/LTA amounts in regime trace. |
| Standard deduction | `standardDeduction` | flat Form 16 value/null | line item constructed, but statutory engine amount comes from `TAX_CONFIG` | Old ₹50,000; New ₹75,000 irrespective of OCR value | Review and waterfall show statutory values. |
| 80C | `section80C` | flat Form 16 number/null | compared with aggregate 80C and higher value becomes primary. Secondary becomes duplicate risk. | Old only, cap ₹1,50,000; New excluded. | Review list and saved line items; recommendation breakdown incorrectly comes from aggregate totals rather than applied items. |
| 80D | `section80D` | flat Form 16 number/null | same higher-wins merge | Old only; current cap is self/family ₹25,000 only; senior-parent detail unavailable | same as 80C. |
| 80CCD | `section80CCD` | flat Form 16 number/null | compared with aggregate NPS amount | stored as unknown section `80CCD`, `needsConfirmation=true`, and therefore always excluded. It is not mapped to 80CCD(1), 1B, or 2. | Excluded list/suggestions, but lacks mandatory explicit status/reason fields. |
| 80E | `section80E` | flat Form 16 number/null | aggregate always returns zero because education loans are not mapped | Old only, uncapped | May be shown only when Form 16 provided it. |
| 24(b) | **not in Gemini field list or Form 16 schema** | no reliable OCR storage | builder reads undeclared `f.section24`; only home-loan aggregation normally supplies it | Old only, capped ₹2,00,000 | Appears only from supplemental records; no Form 16 trace is possible. |
| HRA exemption | HRA and `rentPaid` fields | stored flat | `min(HRA, 10% basic, rent - 10% basic)` | Old only; zero/missing item filtered out | Review has no editable rent-paid control; UI generally cannot complete the claim. |
| LTA | `lta` | stored flat | one Form 16 OCR item | Entire LTA is exempted under old regime without travel/evidence/block validation | Old waterfall only. |

## 3. Requested rule assessment

| Rule | Assessment | Evidence |
|---|---|---|
| Gross only from Form 16 | Partially met | Backend calculations use explicit `f.grossSalary` and do not merge investments into salary. `grossSalarySource='COMPONENT_SUM'` is misleading because no component fallback is used. Browser review can mark any edit as `USER_EDITED`. |
| Component mismatch visible without gross mutation | Partially met | `validateTaxpayerContext` emits mismatch error and leaves gross unchanged. It is a non-blocking error and is only displayed on the recommendation page, not clearly beside Review gross. |
| Investment records supplemental; no salary merge | Met in canonical Form 16 path | `aggregateDeductions` only feeds deduction totals; no salary fields are read. The separate `/api/tax` path derives gross from `Income`, so it is a different product flow. |
| Duplicates never summed | Partially met | Form16-vs-record same-section merge selects a single higher primary and marks secondary duplicate risk. But individual record aggregation can sum multiple duplicate investments, and tuition is double-counted before comparison. |
| One source of truth per deduction | Not met | Aggregate totals erase individual evidence; original/selected/rejected amounts have no first-class merge decision. UI and `deductionBreakdown` use different sources. |
| Required deduction object fields | Not met | `makeLineItem` has section/subtype/amount/source/confidence/needsConfirmation/duplicateRisk, but omits `status`, `reason`, `originFile`, and `verificationMethod`; it also has hidden/optional `notes`, exclusion fields and `originalAmount`. Saved response strips exclusion fields. |
| Deterministic engine/no AI explanations | Not met | Arithmetic is deterministic in canonical engine, but `generateRecommendation` calls Gemini to author explanation and suggestions. |
| UI numbers all represented in calculation trace | Not met | `deductionBreakdown` is aggregate-based; suggestion savings are recalculated in UI; the Review tax display uses `frontend/lib/tax.ts`; static frontend config is separate from backend trace. |
| Reproducible logs per requested stage | Not met | Optional deduction-file log only; OCR logging is optional console output; no durable normalized/context/old/new/recommendation/UI event chain keyed by calculation version/input hash. |

## 4. Tax-engine verification (salary-only baseline)

Assumptions: resident salaried individual, FY 2025-26, no optional deductions, no HRA/LTA exemption, zero TDS/advance/self-assessment tax. Values below are direct execution of `fromForm16` + `computeTax`.

| Gross | Old: taxable / rebate / surcharge / cess / final | New: taxable / rebate / surcharge / cess / final | Result |
|---:|---:|---:|---|
| ₹3,50,000 | ₹3,00,000 / ₹2,500 / ₹0 / ₹0 / **₹0** | ₹2,75,000 / ₹0 / ₹0 / ₹0 / **₹0** | Tie. Engine chooses Old on `<=`, savings ₹0. UI text currently still says “Old Regime saves you more.” |
| ₹8,00,000 | ₹7,50,000 / ₹0 / ₹0 / ₹2,500 / **₹65,000** | ₹7,25,000 / ₹16,250 / ₹0 / ₹0 / **₹0** | New, saves ₹65,000. |
| ₹12,00,000 | ₹11,50,000 / ₹0 / ₹0 / ₹6,300 / **₹1,63,800** | ₹11,25,000 / ₹52,500 / ₹0 / ₹0 / **₹0** | New, saves ₹1,63,800. |
| ₹12,75,000 | ₹12,25,000 / ₹0 / ₹0 / ₹7,200 / **₹1,87,200** | ₹12,00,000 / ₹60,000 / ₹0 / ₹0 / **₹0** | New, saves ₹1,87,200. |
| ₹20,00,000 | ₹19,50,000 / ₹0 / ₹0 / ₹15,900 / **₹4,13,400** | ₹19,25,000 / ₹0 / ₹0 / ₹7,400 / **₹1,92,400** | New, saves ₹2,21,000. |
| ₹30,00,000 | ₹29,50,000 / ₹0 / ₹0 / ₹27,900 / **₹7,25,400** | ₹29,25,000 / ₹0 / ₹0 / ₹18,300 / **₹4,75,800** | New, saves ₹2,49,600. No surcharge. |
| ₹60,00,000 | ₹59,50,000 / ₹0 / ₹1,59,750 / ₹70,290 / **₹18,27,540** | ₹59,25,000 / ₹0 / ₹1,35,750 / ₹59,730 / **₹15,52,980** | New, saves ₹2,74,560. 10% surcharge. |

The canonical calculations follow its configured slabs, cess, and surcharge tiers. The configuration should still be versioned by FY/AY and taxpayer eligibility (resident/age/property) before relying on it for filing-grade computation.

## 5. Section 87A audit

`backend/server/services/taxConfig.js` provides:

* Old: threshold ₹5,00,000; maximum rebate ₹12,500.
* New: threshold ₹12,00,000; maximum rebate ₹60,000.
* New-regime marginal-relief threshold: ₹12,00,000.

`compute87ARebate` reads `cfg.REBATE[regime]`. `computeMarginalRelief` reads `cfg.MARGINAL_RELIEF`. `computeRegimeResult` records those results in the trace. Nothing in these functions hardcodes the legal numeric thresholds; however explanatory strings elsewhere do hardcode several tax values, and `tax.service.js` / frontend duplicate config values.

For FY 2025-26 (AY 2026-27), the Income Tax Department states that the new-regime ₹60,000 87A rebate applies up to ₹12 lakh total income; the Finance Bill amendment takes effect from 1 April 2026. [Income Tax Department AY 2026-27 FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/file-itr-2-online), [Finance Bill 2025](https://www.indiabudget.gov.in/budget2025-26/doc/Finance_Bill.pdf)

Gaps: eligibility does not model resident status; taxable/total-income distinctions and excluded special-rate income are absent; marginal-relief output is stored in the `rebate87A` field, conflating two legal mechanisms; and old-regime age-based slab treatment is unavailable.

## 6. Issue report (priority order)

1. **P0 — Education tuition is double counted.** `aggregateDeductions` already adds `EducationPayment` to 80C. Preview and recommendation calculate `eduTuition` again and `fromForm16` adds it again.
2. **P0 — Three engines can disagree.** Canonical engine, `tax.service.js`, and `frontend/lib/tax.ts` compute tax independently. `tax.service.js` also treats HRA as directly exempt and inserts the same 80CCD amount into both 1B and 2 plan rows.
3. **P0 — Gemini authors recommendation text.** This violates the deterministic recommendation requirement even with prompt constraints.
4. **P0 — The deduction contract is incomplete and unverifiable.** No `status`, `reason`, `originFile`, `verificationMethod`, source record ID, or immutable merge decision. Mongo stores untyped `Mixed` arrays and the API response strips exclusion details.
5. **P0 — 24(b), 80G, and 80CCD are not modelled end-to-end.** 24(b) cannot come from OCR; 80G is stored but dropped by the canonical builder; 80CCD is always ambiguous and excluded, including NPS records.
6. **P1 — HRA and LTA treatment is legally incomplete.** HRA formula omits 40%/50% salary criterion and incorrectly uses 10% basic as a competing ceiling. LTA is fully exempted with no proof/block/eligibility data. `rentPaid` is not editable in Review.
7. **P1 — Professional tax is ignored.** It is extracted and displayed but never used by canonical calculation.
8. **P1 — Supplemental record aggregation lacks FY/evidence controls.** It reads all user records regardless of FY, active status, date, source proof, or whether an EMI estimate represents actual repayment. Education-loan interest is not mapped to 80E.
9. **P1 — Finalization is client-trusting.** The client sends unvalidated `finalizedDeductions`; a subsequent Review edit rebuilds browser deductions and can discard already-loaded investment records before finalization.
10. **P1 — Cached recommendation invalidation is unsafe.** Upload deletes Form 16s first, may leave recommendation orphans, and `findOneAndReplace` is not covered by the stale hooks shown. Caching has no calculation/config/input hash.
11. **P1 — `computeTax` mutates input and skips an assertion.** It writes `ctx.computedIncome`; code after the first `return result` is unreachable, so `assertTaxResultConsistency` never runs.
12. **P1 — UI makes unsupported claims.** Tie text says one regime “saves you more”; suggestion savings are recomputed in the browser; aggregate deduction breakdown can differ from applied deductions; fallback recommendation traces use fields never persisted.
13. **P2 — Logging is incomplete and may expose PII.** Requested stages are not logged. The existing optional file log stores raw deduction data without redaction, retention, correlation IDs, input hashes, or access control.
14. **P2 — Regression coverage is fragmented.** `node --test backend/server/services/taxEngine.test.js backend/server/services/tax.service.test.js` passes 116 tests, but package scripts do not run tests. Other `*.test.js` files use Jest globals although Jest is not declared, so they are not part of the passing command.

## 7. Refactoring plan (approval required before implementation)

1. Define versioned domain contracts: `RawOcrDocument`, `NormalizedForm16`, `SalarySnapshot`, `DeductionCandidate`, `MergeDecision`, `ValidatedDeduction`, `TaxCalculation`, and `RecommendationViewModel`. Require all requested deduction fields plus record ID and calculation/config versions.
2. Replace aggregate-before-merge with candidate-level adapters. Each adapter returns deduction candidates only, filtered to selected FY and active/evidence-valid records. Remove separate `eduTuition`; map education tuition once to 80C and education-loan interest once to 80E.
3. Build one pure canonical pipeline: normalize → candidate merge → validation → old/new calculation → deterministic recommendation → serialised trace. Persist input snapshot, merge decisions, output, input hash, and config version atomically.
4. Make Form 16 salary immutable during record merge. Explicit OCR/manual Form 16 gross remains the only gross source; components only create mismatch diagnostics. Add review fields needed for HRA/LTA proof and use legal, configurable rules.
5. Replace all duplicate calculators. Make `/api/tax/*` call the canonical service or retire it. Remove tax arithmetic from the frontend; the Review preview should call a server-side draft-calculation endpoint using the same pipeline.
6. Implement section-specific validators and statuses: malformed/non-positive/unknown subtype/duplicate/law-cap/regime-disallowed/needs-documentation. Preserve excluded candidates instead of filtering them away. Add proper 80D age buckets, 80CCD subtype evidence, 80G eligibility percentage, 24(b) property type, and professional tax.
7. Remove Gemini from recommendation generation. Use deterministic templates only, including an explicit equal-tax message. Generate suggestions from trace fields and attach their trace references.
8. Make UI trace-driven. API returns the saved `RecommendationViewModel`; every displayed number includes a trace ID/path. Remove UI suggestion/tax fallbacks and use identical backend config metadata.
9. Add secure structured audit events: `RAW_OCR` (redacted/reference only), `NORMALIZED`, `AFTER_MERGE`, `VALIDATED`, `OLD_ENGINE`, `NEW_ENGINE`, `RECOMMENDATION`, `UI_PAYLOAD`, all with correlation ID, input hash, config version, timestamp, and actor—not raw PII in plaintext logs.
10. Add a single test command and fixture suite: candidate merge conflicts, all section paths, error statuses, stale-cache behavior, all seven salary cases, 87A/marginal relief/surcharge boundaries, API/UI contract assertions, and snapshot reproducibility.

## 8. Verification performed

* Read-only repository trace of upload, OCR, models, aggregation, canonical engine, legacy engine, routes, frontend context/API/pages, cache hooks, and existing tests.
* Executed `node --test backend/server/services/taxEngine.test.js backend/server/services/tax.service.test.js`: **116 passed, 0 failed**.
* Executed the requested salary matrix directly through the canonical `fromForm16` → `computeTax` path; results are in section 4.
* Checked FY 2025-26/AY 2026-27 87A/slab information against official government sources linked in section 5.

