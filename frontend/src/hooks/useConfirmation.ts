import { createContext, useContext } from 'react'

export type ConfirmAction = (title: string, message: string, action?: string) => Promise<boolean>

export const ConfirmationContext = createContext<ConfirmAction>(async () => false)

export function useConfirmation() {
  return useContext(ConfirmationContext)
}
