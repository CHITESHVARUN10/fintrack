/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy classes remapped to CSS variables — identical light values,
        // dark values flip with .dark (defined in src/index.css).
        // rgb(triplet / <alpha-value>) format keeps /NN opacity modifiers working.
        'brand-yellow': 'rgb(var(--c-accent) / <alpha-value>)',
        'on-surface': 'rgb(var(--c-on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--c-on-surface-variant) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--c-surface-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--c-surface-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--c-surface-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--c-surface-highest) / <alpha-value>)',
        'surface-variant': 'rgb(var(--c-surface-variant) / <alpha-value>)',
        'surface': 'rgb(var(--c-surface-base) / <alpha-value>)',
        'background': 'rgb(var(--c-bg) / <alpha-value>)',
        'tertiary-container': 'rgb(var(--c-tertiary-container) / <alpha-value>)',
        'tertiary-fixed': '#00fcfb',
        'on-tertiary-container': 'rgb(var(--c-on-tertiary-container) / <alpha-value>)',
        'on-tertiary': '#ffffff',
        'secondary-container': 'rgb(var(--c-secondary-container) / <alpha-value>)',
        'secondary-fixed': 'rgb(var(--c-secondary-container) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--c-on-secondary-container) / <alpha-value>)',
        'error-container': 'rgb(var(--c-error-container) / <alpha-value>)',
        'on-error-container': 'rgb(var(--c-on-error-container) / <alpha-value>)',
        'outline-variant': 'rgb(var(--c-outline-variant) / <alpha-value>)',
        // Tailwind default `white` remapped: bg-white = card surface.
        // Channels format — a bare var() is invalid as a color and would
        // resolve to transparent (the bug that made panels see-through).
        white: 'rgb(var(--c-white) / <alpha-value>)',
        // Semantic design tokens — CSS variables switch with .dark
        'token-page': 'var(--bg-page)',
        'token-sidebar': 'var(--bg-sidebar)',
        'token-surface': 'var(--bg-surface)',
        'token-card': 'var(--bg-card)',
        'token-input': 'var(--bg-input)',
        'token-header': 'var(--bg-header)',
        'token-elevated': 'var(--bg-elevated)',
        'token-primary': 'var(--text-primary)',
        'token-secondary': 'var(--text-secondary)',
        'token-muted': 'var(--text-muted)',
        'token-border': 'var(--border)',
        'token-border-strong': 'var(--border-strong)',
        'token-accent': 'var(--accent)',
        'token-accent-hover': 'var(--accent-hover)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '9999px',
      },
      boxShadow: {
        brutal: '4px 4px 0px 0px var(--shadow)',
        'brutal-sm': '2px 2px 0px 0px var(--shadow)',
        'brutal-hover': '2px 2px 0px 0px var(--shadow)',
        layout: '4px 0px 0px 0px var(--shadow)',
      },
      spacing: {
        xs: '8px',
        sm: '16px',
        md: '24px',
        lg: '40px',
        xl: '64px',
      },
    },
  },
  plugins: [],
}
