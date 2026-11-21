import { useEffect, useRef } from 'react'

type Shape = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vrot: number
  type: 'rect' | 'square' | 'tri'
  accent: boolean
}

const TYPES: Shape['type'][] = ['rect', 'square', 'tri']

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function readColors() {
  const isDark =
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark')
  const styles = getComputedStyle(document.documentElement)
  const ink =
    styles.getPropertyValue('--border-strong').trim() ||
    styles.getPropertyValue('--text-primary').trim() ||
    (isDark ? '#f5f5f2' : '#1e1c10')
  const accent =
    styles.getPropertyValue('--accent').trim() || (isDark ? '#ffe500' : '#ffe500')
  return { ink, accent, isDark }
}

// Animated neubrutalist backdrop for the auth screens: drifting outlined
// geometric shapes, a slow hatch of diagonal lines, and a scatter of static
// texture marks. Colors are read from the theme tokens and re-read when the
// theme flips, so the same canvas works in light and dark. Everything is drawn
// at low opacity so the form card stays legible.
export function AuthBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    let colors = readColors()
    const shapes: Shape[] = []
    const statics: { x: number; y: number; kind: string; accent: boolean }[] = []
    let lineOffset = 0

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const seed = () => {
      shapes.length = 0
      const count = Math.floor(rand(12, 17))
      for (let i = 0; i < count; i++) {
        shapes.push({
          x: rand(0, w || 800),
          y: rand(0, h || 600),
          vx: rand(0.2, 0.6) * (Math.random() < 0.5 ? -1 : 1),
          vy: rand(0.2, 0.6) * (Math.random() < 0.5 ? -1 : 1),
          size: rand(40, 110),
          rot: rand(0, 360),
          vrot: rand(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1),
          type: TYPES[Math.floor(Math.random() * TYPES.length)],
          accent: Math.random() < 0.3,
        })
      }
      statics.length = 0
      const sc = Math.floor(rand(20, 31))
      const kinds = ['plus', 'sq', 'sqy', 'star']
      for (let i = 0; i < sc; i++) {
        statics.push({
          x: rand(0, w || 800),
          y: rand(0, h || 600),
          kind: kinds[Math.floor(Math.random() * kinds.length)],
          accent: Math.random() < 0.5,
        })
      }
    }

    const drawStatic = () => {
      ctx.save()
      ctx.globalAlpha = colors.isDark ? 0.22 : 0.15
      ctx.lineWidth = 3
      for (const s of statics) {
        ctx.strokeStyle = colors.ink
        ctx.fillStyle = s.accent ? colors.accent : colors.ink
        if (s.kind === 'plus') {
          ctx.beginPath()
          ctx.moveTo(s.x - 8, s.y)
          ctx.lineTo(s.x + 8, s.y)
          ctx.moveTo(s.x, s.y - 8)
          ctx.lineTo(s.x, s.y + 8)
          ctx.stroke()
        } else if (s.kind === 'star') {
          ctx.font = 'bold 18px "Space Grotesk", sans-serif'
          ctx.fillText('*', s.x, s.y + 6)
        } else if (s.kind === 'sq') {
          ctx.strokeRect(s.x - 5, s.y - 5, 10, 10)
        } else {
          ctx.fillRect(s.x - 5, s.y - 5, 10, 10)
        }
      }
      ctx.restore()
    }

    const drawLines = () => {
      ctx.save()
      ctx.globalAlpha = colors.isDark ? 0.05 : 0.07
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 3
      const spacing = 90
      const diag = Math.sqrt(w * w + h * h)
      for (let x = -diag; x < diag; x += spacing) {
        ctx.beginPath()
        ctx.moveTo(x + lineOffset, 0)
        ctx.lineTo(x + lineOffset + diag, diag)
        ctx.stroke()
      }
      ctx.restore()
    }

    const drawShapes = () => {
      ctx.save()
      ctx.globalAlpha = colors.isDark ? 0.16 : 0.12
      ctx.lineWidth = 3
      for (const s of shapes) {
        ctx.save()
        ctx.translate(s.x, s.y)
        ctx.rotate((s.rot * Math.PI) / 180)
        ctx.strokeStyle = colors.ink
        ctx.fillStyle = s.accent ? colors.accent : 'transparent'
        if (s.type === 'tri') {
          ctx.beginPath()
          ctx.moveTo(0, -s.size / 2)
          ctx.lineTo(s.size / 2, s.size / 2)
          ctx.lineTo(-s.size / 2, s.size / 2)
          ctx.closePath()
          if (s.accent) ctx.fill()
          ctx.stroke()
        } else {
          const dim = s.type === 'square' ? s.size : s.size * 1.4
          if (s.accent) ctx.fillRect(-dim / 2, -s.size / 2, dim, s.size)
          ctx.strokeRect(-dim / 2, -s.size / 2, dim, s.size)
        }
        ctx.restore()

        // Move + bounce off edges (instant reversal).
        s.x += s.vx
        s.y += s.vy
        s.rot += s.vrot
        const r = s.size
        if (s.x < -r) s.x = w + r
        if (s.x > w + r) s.x = -r
        if (s.y < -r) s.y = h + r
        if (s.y > h + r) s.y = -r
      }
      ctx.restore()
    }

    resize()
    seed()
    let raf = 0
    const loop = () => {
      ctx.clearRect(0, 0, w, h)
      drawStatic()
      lineOffset -= 0.4
      drawLines()
      drawShapes()
      raf = requestAnimationFrame(loop)
    }
    loop()

    // Theme flips change the token values, not the canvas — re-read them.
    const observer = new MutationObserver(() => {
      colors = readColors()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}
