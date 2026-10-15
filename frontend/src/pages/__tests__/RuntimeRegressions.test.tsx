import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Dashboard } from '../Dashboard'
import { Modal } from '../../components/ui/Modal'
import { dashboardService, form16Service } from '../../services/api'
import { apiClient } from '../../services/apiClient'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }))

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('runtime regressions', () => {
  it('shows a dashboard request error instead of loading forever', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'self' }, activeMemberId: 'self', isAdmin: false } as ReturnType<typeof useAuth>)
    vi.spyOn(dashboardService, 'getSummary').mockRejectedValue(new Error('Unavailable'))
    render(<Dashboard />)
    expect(await screen.findByText('Could not load dashboard.')).toBeInTheDocument()
    expect(screen.queryByText('Loading dashboard…')).not.toBeInTheDocument()
  })

  it('requests the selected family member dashboard', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'admin' }, activeMemberId: 'member', isAdmin: true } as ReturnType<typeof useAuth>)
    const load = vi.spyOn(dashboardService, 'getSummary').mockImplementation(() => new Promise(() => {}))
    render(<Dashboard />)
    await waitFor(() => expect(load).toHaveBeenCalledWith('member'))
  })

  it('retains suggestion section and action metadata through the API adapter', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data: String(url).endsWith('/recommendation')
      ? { taxSavingSuggestions: [{ section: '80D', suggestionType: 'RESOLVE_DUPLICATE', suggestion: 'Review duplicate', potentialSaving: 0 }], regimes: { old: {}, new: {} } }
      : { _id: 'form', userId: 'self', grossSalary: 1000000 } }))
    const result = await form16Service.getRecommendation('form')
    expect(result.taxSavingSuggestions[0]).toMatchObject({ section: '80D', suggestionType: 'RESOLVE_DUPLICATE', title: 'Review duplicate' })
  })

  it('labels the modal, traps Tab, handles Escape, and restores focus and scrolling', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger); trigger.focus()
    const close = vi.fn()
    const view = render(<Modal open title="Review payment" onClose={close}><button>Save</button></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Review payment' })
    expect(dialog.parentElement).toBe(document.body)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus())
    screen.getByRole('button', { name: 'Save' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    view.unmount()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })
})
