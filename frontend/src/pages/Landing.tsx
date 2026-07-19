import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'

const features = [
  { icon: 'account_balance_wallet', title: 'Income Tracker', desc: 'Log multiple income streams accurately.', color: 'bg-brand-yellow' },
  { icon: 'subscriptions', title: 'Subscriptions', desc: 'Never pay for forgotten services again.', color: 'bg-white' },
  { icon: 'trending_up', title: 'SIPs & Mutuals', desc: 'Auto-sync your investment portfolios.', color: 'bg-brand-yellow' },
  { icon: 'real_estate_agent', title: 'Loans & EMIs', desc: 'Track principal vs interest over time.', color: 'bg-white' },
  { icon: 'receipt_long', title: 'Daily Expenses', desc: 'Categorize spending with custom tags.', color: 'bg-brand-yellow' },
  { icon: 'health_and_safety', title: 'Insurance', desc: 'Keep track of premiums and coverage.', color: 'bg-white' },
]

export function Landing() {
  const { ref: featuresRef, inView: featuresVisible } = useInView({ threshold: 0.15, triggerOnce: true })
  const { ref: footerRef, inView: footerVisible } = useInView({ threshold: 0.15, triggerOnce: true })
  return (
    <div className="min-h-screen flex flex-col bg-white text-on-surface font-sans overflow-x-hidden">
      {/* Navbar */}
      <nav className="w-full border-b-4 border-on-surface bg-white sticky top-0 z-50 flex justify-between items-center px-md py-sm">
        <div className="font-bold text-2xl uppercase tracking-tighter">FinStack</div>
        <div className="hidden md:flex gap-md font-bold">
          <a className="hover:underline underline-offset-4 decoration-[3px]" href="#features">
            Features
          </a>
          <a className="hover:underline underline-offset-4 decoration-[3px]" href="#">
            Pricing
          </a>
          <a className="hover:underline underline-offset-4 decoration-[3px]" href="#">
            About
          </a>
        </div>
        <Link to="/login">
          <button className="bg-brand-yellow border-4 border-on-surface px-md py-1 font-bold shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all">
            Log In
          </button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative w-full flex flex-col md:flex-row items-stretch border-b-4 border-on-surface">
        <div className="w-full md:w-1/2 p-md md:p-xl flex flex-col justify-center border-b-4 md:border-b-0 md:border-r-4 border-on-surface">
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="text-5xl md:text-7xl font-bold uppercase leading-[0.95] tracking-tight mb-md">
            Know where
            <br />
            every{' '}
            <span className="bg-brand-yellow px-2 border-4 border-on-surface shadow-brutal-sm inline-block -rotate-2">
              rupee
            </span>
            <br />
            is going.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }} className="text-lg font-medium mb-xl max-w-lg border-l-4 border-on-surface pl-sm">
            Stop wondering where your money went. Track income, investments,
            subscriptions, and family expenses in one ruthlessly organized
            dashboard.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3, ease: 'easeOut' }} className="flex flex-col sm:flex-row gap-sm">
            <Link to="/register" className="flex-1">
              <Button variant="yellow" size="lg" block>
                Get Started Free
              </Button>
            </Link>
            <Link to="/login" className="flex-1">
              <Button variant="white" size="lg" block>
                See How It Works
              </Button>
            </Link>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="w-full md:w-1/2 p-md flex items-center justify-center bg-surface-container-low relative">
          <div className="w-full max-w-lg bg-white border-4 border-on-surface p-md shadow-brutal relative z-10">
            <div className="border-b-4 border-on-surface pb-sm mb-sm flex justify-between items-center">
              <div className="font-bold text-lg">Dashboard Overview</div>
              <Icon name="dashboard" className="text-2xl" filled />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center p-sm border-2 border-on-surface">
                <div className="font-bold">Total Balance</div>
                <div className="font-bold">₹14,50,000</div>
              </div>
              <div className="flex justify-between items-center p-sm border-2 border-on-surface bg-brand-yellow">
                <div className="font-bold">Monthly Expenses</div>
                <div className="font-bold">₹45,200</div>
              </div>
              <div className="h-32 border-2 border-on-surface mt-sm flex items-end gap-2 p-2">
                <div className="w-1/5 bg-on-surface h-[40%]" />
                <div className="w-1/5 bg-on-surface h-[70%]" />
                <div className="w-1/5 bg-brand-yellow border-2 border-on-surface h-[90%]" />
                <div className="w-1/5 bg-on-surface h-[50%]" />
                <div className="w-1/5 bg-on-surface h-[30%]" />
              </div>
            </div>
          </div>
          <div className="absolute w-64 h-64 border-4 border-on-surface bg-brand-yellow translate-x-12 translate-y-12 -z-0" />
        </motion.div>
      </section>

      {/* Features */}
      <section ref={featuresRef} id="features" className="w-full p-md md:p-xl border-b-4 border-on-surface">
        <h2 className="text-3xl md:text-4xl font-bold mb-xl uppercase border-b-4 border-on-surface pb-sm inline-block">
          Everything in one place.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {features.map((f, index) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 40 }}
              animate={featuresVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
              transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
              className={`border-4 border-on-surface p-md shadow-brutal nb-card-hover ${f.color}`}
            >
              <div
                className={`w-12 h-12 border-4 border-on-surface flex items-center justify-center mb-sm ${
                  f.color === 'bg-brand-yellow' ? 'bg-white' : 'bg-brand-yellow'
                }`}
              >
                <Icon name={f.icon} className="text-2xl" filled={f.color === 'bg-white'} />
              </div>
              <h3 className="text-lg font-bold mb-1">{f.title}</h3>
              <p className="font-medium">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <motion.footer ref={footerRef} initial={{ opacity: 0, y: 20 }} animate={footerVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration: 0.35, ease: 'easeOut' }} className="w-full p-md md:p-xl bg-white flex flex-col md:flex-row justify-between gap-xl border-t-8 border-on-surface">
        <div className="flex-1">
          <div className="font-bold text-2xl uppercase tracking-tighter mb-sm">FinStack</div>
          <p className="font-medium max-w-xs border-l-4 border-brand-yellow pl-xs">
            Neubrutalist wealth management for those who want radical transparency.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-bold mb-xs uppercase">Product</div>
          <a className="hover:bg-brand-yellow px-1 w-fit" href="#">Features</a>
          <a className="hover:bg-brand-yellow px-1 w-fit" href="#">Pricing</a>
          <a className="hover:bg-brand-yellow px-1 w-fit" href="#">Security</a>
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-bold mb-xs uppercase">Legal</div>
          <a className="hover:bg-brand-yellow px-1 w-fit" href="#">Privacy Policy</a>
          <a className="hover:bg-brand-yellow px-1 w-fit" href="#">Terms of Service</a>
          <p className="text-xs mt-sm text-on-surface-variant">© 2026 FinStack Inc.</p>
        </div>
      </motion.footer>
    </div>
  )
}
