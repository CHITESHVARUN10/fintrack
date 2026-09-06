import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getInitialTheme(): Theme {
  // Default is always light. Only an explicit stored user choice selects dark —
  // the OS color-scheme preference is deliberately ignored.
  try {
    const stored = localStorage.getItem('fintrack-theme') as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // SSR safe - use light initially, correct in effect
    if (typeof window === 'undefined') return 'light'
    return getInitialTheme()
  })

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem('fintrack-theme', t) } catch {}
  }

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  useEffect(() => {
    const root = document.documentElement
    // set class and data-theme (support both selectors)
    if (theme === 'dark') {
      root.classList.add('dark')
      root.setAttribute('data-theme', 'dark')
    } else {
      root.classList.remove('dark')
      root.setAttribute('data-theme', 'light')
    }
    // also set color-scheme for native controls
    root.style.colorScheme = theme
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
