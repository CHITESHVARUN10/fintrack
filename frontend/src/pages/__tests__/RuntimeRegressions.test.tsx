import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { Transactions } from '../Transactions'
import { Reports } from '../Reports'
import { Dashboard } from '../Dashboard'
import { Modal } from '../../components/ui/Modal'
import { dashboardService, reportService, transactionService } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

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

  it('validates an amount locally and keeps focus on the field', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'self', familyAccountId: 'family' }, members: [], isAdmin: false,
    } as unknown as ReturnType<typeof useAuth>)
    vi.spyOn(transactionService, 'list').mockResolvedValue({ items: [] } as never)
    const create = vi.spyOn(transactionService, 'create')
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    const amount = screen.getByRole('textbox', { name: 'Amount ₹' })
    fireEvent.change(amount, { target: { value: '-250' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount greater than ₹0')
    expect(amount).toHaveFocus()
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a report with missing dates before requesting a download', async () => {
    const download = vi.spyOn(reportService, 'download')
    render(<Reports />)
    fireEvent.change(screen.getByLabelText('FROM'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a start date and an end date.')
    expect(download).not.toHaveBeenCalled()
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
