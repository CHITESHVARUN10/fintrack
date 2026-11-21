export interface NavItem {
  label: string
  to: string
  icon: string
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: 'dashboard' },
  { label: 'Income', to: '/income', icon: 'account_balance_wallet' },
  { label: 'Subscriptions', to: '/subscriptions', icon: 'subscriptions' },
  { label: 'Recurring Payments', to: '/recurring', icon: 'autorenew' },
  { label: 'Investments', to: '/investments', icon: 'trending_up' },
  { label: 'Tax Calculator', to: '/tax', icon: 'calculate' },
  { label: 'Reports', to: '/reports', icon: 'bar_chart' },
  { label: 'Family Dashboard', to: '/family/dashboard', icon: 'monitoring' },
  { label: 'Members', to: '/family', icon: 'group' },
  { label: 'Vendors', to: '/vendors', icon: 'store' },
  { label: 'Transactions', to: '/transactions', icon: 'receipt_long' },
  { label: 'Import', to: '/import', icon: 'upload_file' },
  { label: 'Budgets', to: '/budgets', icon: 'savings' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
]

export const routeTitles: Record<string, string> = {
  '/dashboard': 'FinStack Dashboard',
  '/income': 'Income Tracker',
  '/income/new': 'Add Income',
  '/subscriptions': 'Subscriptions',
  '/recurring': 'Recurring Payments',
  '/investments': 'Investments',
  '/tax': 'Tax Calculator',
  '/reports': 'Reports',
  '/family/dashboard': 'Family Dashboard',
  '/family': 'Members',
  '/vendors': 'Vendors',
  '/transactions': 'Transactions',
  '/import': 'Import',
  '/budgets': 'Budgets',
  '/settings': 'Settings',
  '/notifications': 'Notifications',
  '/privacy': 'Privacy Policy',
  '/docs': 'Documentation',
  '/terms': 'Privacy Policy',
}
