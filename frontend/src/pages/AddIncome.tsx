import { Income } from './Income'

// Route target for /income/new — opens the Income page with the add modal.
export function AddIncome() {
  return <Income initialAddOpen />
}
