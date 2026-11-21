import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="fin-app-footer">
      <span>FinStack {new Date().getFullYear()}</span>
      <nav aria-label="Product resources">
        <Link to="/privacy">Privacy</Link>
        <Link to="/docs">Docs</Link>
      </nav>
    </footer>
  )
}
