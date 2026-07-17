export interface NavItem {
  label: string
  to: string
  icon: string
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: 'dashboard' },
  { label: 'Income', to: '/income', icon: 'account_balance_wallet' },
  { label: 'Subscriptions', to: '/subscriptions', icon: 'subscriptions' },
  { label: 'Recurring Payments', to: '/recurring', icon: 'autorenew' },
  { label: 'Investments', to: '/investments', icon: 'trending_up' },
  { label: 'EMI and Loans', to: '/loans', icon: 'real_estate_agent' },
  { label: 'Expenses', to: '/expenses', icon: 'receipt_long' },
  { label: 'Insurance', to: '/insurance', icon: 'health_and_safety' },
  { label: 'Education', to: '/education', icon: 'school' },
  { label: 'Form 16', to: '/form16', icon: 'receipt_long' },
  { label: 'Tax Calculator', to: '/tax', icon: 'calculate' },
  { label: 'Reports', to: '/reports', icon: 'bar_chart' },
  { label: 'Members', to: '/family', icon: 'group' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
]

export const routeTitles: Record<string, string> = {
  '/': 'FinStack Dashboard',
  '/income': 'Income Tracker',
  '/subscriptions': 'Subscriptions',
  '/recurring': 'Recurring Payments',
  '/investments': 'Investments',
  '/loans': 'EMI & Loans',
  '/expenses': 'Expenses',
  '/insurance': 'Insurance',
  '/education': 'Education',
  '/form16': 'Form 16 Records',
  '/tax': 'Tax Calculator',
  '/reports': 'Reports',
  '/family': 'Members',
  '/settings': 'Settings',
}
