import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, beforeEach, it, expect } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TaxRecommendation } from '../TaxRecommendation'
import { form16Service } from '../../services/api'
import React from 'react'

// Mock the API service
vi.mock('../../services/api', () => ({
  form16Service: {
    getRecommendation: vi.fn(),
  },
}))

describe('TaxRecommendation duplicate suggestion render bug (Final 3% Part 1)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockTaxResult = (suggestions: any[]) => ({
    id: 'TAXREC-123',
    form16Id: '123',
    userId: 'user-1',
    grossIncome: 1500000,
    recommendedRegime: 'New',
    savingsAmount: 50000,
    explanation: 'Test explanation',
    regimes: { 
      old: {
        salaryExemptions: { hra: 0, lta: 0 },
        deductions: [],
        slabs: []
      }, 
      new: {
        salaryExemptions: { hra: 0, lta: 0 },
        deductions: [],
        slabs: []
      } 
    },
    taxSavingSuggestions: suggestions,
    grossSalaryUsed: 1500000,
    totalDeductions: 0,
    deductionBreakdown: [],
    grossSalaryMismatch: false,
    mismatchDetail: null,
    debug: null,
    deductionLineItems: [],
    calculationTrace: [],
    generatedAt: new Date().toISOString(),
    isStale: false,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders exactly four suggestion cards when exactly four unique suggestions are provided', async () => {
    const suggestions = [
      { id: '1', title: 'Claim 80C', detail: 'Invest 1.5L', icon: 'savings', potentialSaving: 45000 },
      { id: '2', title: 'Claim 80D', detail: 'Health insurance', icon: 'health_and_safety', potentialSaving: 7500 },
      { id: '3', title: 'Claim 80CCD', detail: 'NPS contribution', icon: 'account_balance', potentialSaving: 15000 },
      { id: '4', title: 'Claim 24b', detail: 'Home loan interest', icon: 'home', potentialSaving: 60000 },
    ]

    ;(form16Service.getRecommendation as vi.Mock).mockResolvedValue(mockTaxResult(suggestions))

    render(
      <MemoryRouter initialEntries={['/form16/123/recommendation']}>
        <Routes>
          <Route path="/form16/:id/recommendation" element={<TaxRecommendation />} />
        </Routes>
      </MemoryRouter>
    )

    // Wait for data to load
    const heading = await screen.findByText('Tax Saving Suggestions (Next FY)')
    expect(heading).toBeInTheDocument()

    // Assert that we have exactly 4 cards (we can check by searching for 'Potential Savings:')
    const savingsLabels = screen.getAllByText('Potential Savings:')
    expect(savingsLabels).toHaveLength(4)
  })

  it('renders exactly three suggestion cards when four are provided but two are identical (dedup guard test)', async () => {
    const suggestions = [
      { id: '1', title: 'Claim 80C', detail: 'Invest 1.5L', icon: 'savings', potentialSaving: 45000 },
      { id: '2', title: 'Claim 80C', detail: 'Invest 1.5L', icon: 'savings', potentialSaving: 45000 }, // IDENTICAL TO #1
      { id: '3', title: 'Claim 80CCD', detail: 'NPS contribution', icon: 'account_balance', potentialSaving: 15000 },
      { id: '4', title: 'Claim 24b', detail: 'Home loan interest', icon: 'home', potentialSaving: 60000 },
    ]

    ;(form16Service.getRecommendation as vi.Mock).mockResolvedValue(mockTaxResult(suggestions))

    render(
      <MemoryRouter initialEntries={['/form16/123/recommendation']}>
        <Routes>
          <Route path="/form16/:id/recommendation" element={<TaxRecommendation />} />
        </Routes>
      </MemoryRouter>
    )

    const heading = await screen.findByText('Tax Saving Suggestions (Next FY)')
    expect(heading).toBeInTheDocument()

    // The dedup guard should have collapsed the two 80C suggestions into one.
    const savingsLabels = screen.getAllByText('Potential Savings:')
    expect(savingsLabels).toHaveLength(3)
  })
})
