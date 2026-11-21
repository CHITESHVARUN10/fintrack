import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Icon } from '../components/ui/Icon'
import { Reveal } from '../components/motion'
import { formatCurrency } from '../lib/format'
import { Badge } from '../components/ui/Badge'
import './entry-overview.css'

const FEATURES = [
  { icon: 'account_balance_wallet', title: 'Income Tracker', desc: 'Log multiple income streams accurately.', accent: true },
  { icon: 'subscriptions', title: 'Subscriptions', desc: 'Never pay for forgotten services again.', accent: false },
  { icon: 'trending_up', title: 'SIPs & Mutuals', desc: 'Auto-sync your investment portfolios.', accent: true },
  { icon: 'receipt_long', title: 'Daily Expenses', desc: 'Categorize spending with custom tags.', accent: true },
  { icon: 'monitoring', title: 'Family Dashboard', desc: 'See every member’s spend in one place.', accent: false },
  { icon: 'bar_chart', title: 'Reports & Budgets', desc: 'Monthly, annual and family reports.', accent: true },
]

// Illustrative sample used only for the marketing preview. Month labels follow
// the current calendar so the hero never looks stale.
const OUTFLOW_SAMPLE = [21400, 33800, 45200, 26900, 17650]

function monthLabels(count: number): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()
  })
}

export function Landing() {
  const reduceMotion = useReducedMotion()
  const months = useMemo(() => monthLabels(OUTFLOW_SAMPLE.length), [])
  const peak = OUTFLOW_SAMPLE.indexOf(Math.max(...OUTFLOW_SAMPLE))
  const [activeBar, setActiveBar] = useState(peak)

  const BAR_W = 58
  const GAP = 20
  const START_X = 14
  const BASE_Y = 106
  const maxVal = Math.max(...OUTFLOW_SAMPLE)

  return (
    <div className="fse-landing">
      <header className="fse-landing-nav">
        <Link to="/" className="fse-brand" aria-label="FinStack home">
          <span className="fse-brand-sq" aria-hidden="true">F</span>
          <span className="fse-brand-word">FinStack</span>
        </Link>
        <nav className="fse-landing-links" aria-label="Landing">
          <a href="#features">Features</a>
          <Link to="/docs">Docs</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
        <Link to="/login" className="fin-button fse-btn is-sm">Log In</Link>
      </header>

      <section className="fse-hero">
        <div className="fse-hero-left">
          <motion.h1
            className="fse-hero-h1"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            Know where
            <br />
            every <span className="fse-rupee">rupee</span>
            <br />
            is going.
          </motion.h1>
          <motion.p
            className="fse-hero-sub"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
          >
            Stop wondering where your money went. Track income, investments,
            subscriptions, and family expenses in one ruthlessly organized
            dashboard.
          </motion.p>
          <motion.div
            className="fse-hero-ctas"
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
          >
            <Link to="/register" className="fin-button fse-btn">Get Started Free</Link>
            <a href="#features" className="fin-button fse-btn is-white">See How It Works</a>
          </motion.div>
        </div>

        <motion.div
          className="fse-hero-right"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="fse-preview">
            <div className="fse-preview-head">
              <span>Dashboard Overview</span>
              <Badge color="surface">Preview</Badge>
            </div>

            <div className="fse-preview-row">
              <span>Total Balance</span>
              <span>{formatCurrency(1450000)}</span>
            </div>
            <div className="fse-preview-row is-accent">
              <span>Monthly Expenses</span>
              <span>{formatCurrency(45200)}</span>
            </div>

            <div className="fse-preview-chart">
              <div className="fse-readout">
                <span>5-month outflow · {months[0]}–{months[months.length - 1]}</span>
                <strong aria-live="polite">
                  {months[activeBar]} · {formatCurrency(OUTFLOW_SAMPLE[activeBar])}
                </strong>
              </div>
              <svg
                className="fse-hero-svg"
                viewBox="0 0 400 130"
                role="img"
                aria-label="Sample monthly outflow for the last five months"
              >
                <line x1="8" y1={BASE_Y} x2="392" y2={BASE_Y} stroke="var(--fse-line)" strokeWidth="2" />
                <line x1="8" y1={BASE_Y - 45} x2="392" y2={BASE_Y - 45} stroke="var(--fse-muted)" strokeOpacity="0.3" strokeDasharray="3 3" />
                <line x1="8" y1={BASE_Y - 90} x2="392" y2={BASE_Y - 90} stroke="var(--fse-muted)" strokeOpacity="0.3" strokeDasharray="3 3" />
                {OUTFLOW_SAMPLE.map((value, i) => {
                  const h = Math.max(8, Math.round((value / maxVal) * 92))
                  const x = START_X + i * (BAR_W + GAP)
                  const y = BASE_Y - h
                  const on = i === activeBar
                  return (
                    <g
                      key={months[i]}
                      className="fse-hero-bar"
                      tabIndex={0}
                      role="img"
                      aria-label={`${months[i]}: ${formatCurrency(value)}`}
                      onMouseEnter={() => setActiveBar(i)}
                      onFocus={() => setActiveBar(i)}
                      onClick={() => setActiveBar(i)}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={BAR_W}
                        height={h}
                        fill={on ? 'var(--fse-accent)' : 'var(--fse-ink)'}
                        stroke="var(--fse-line)"
                        strokeWidth="2"
                      />
                      <rect x={x} y={0} width={BAR_W} height={BASE_Y} fill="transparent" />
                      <text
                        x={x + BAR_W / 2}
                        y={BASE_Y + 18}
                        textAnchor="middle"
                        fill={on ? 'var(--fse-ink)' : 'var(--fse-muted)'}
                        fontSize="10.5"
                        fontWeight="800"
                        letterSpacing="0.04em"
                      >
                        {months[i]}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="fse-features" id="features">
        <div className="fse-features-inner">
          <h2 className="fse-h2">Everything in one place.</h2>
          <div className="fse-feature-grid">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.05} y={14}>
                <article className={`fse-feature${f.accent ? ' is-accent' : ''}`}>
                  <div className="fse-feature-icon">
                    <Icon name={f.icon} className="text-[20px]" filled />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <footer className="fse-landing-footer">
        <div className="fse-footer-inner">
          <div>
            <span className="fse-brand-word">FinStack</span>
            <p className="fse-footer-tagline">
              Neubrutalist wealth management for those who want radical transparency.
            </p>
          </div>
          <div className="fse-footer-cols">
            <div className="fse-footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><Link to="/register">Get Started</Link></li>
                <li><Link to="/docs">Docs &amp; Tutorials</Link></li>
              </ul>
            </div>
            <div className="fse-footer-col">
              <h4>Legal</h4>
              <ul>
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/login">Log In</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="fse-footer-copy">© 2026 FinStack Inc.</div>
      </footer>
    </div>
  )
}
