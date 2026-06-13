import { useEffect, useRef } from 'react'

interface KnobProps {
  size: number
  /** absolute value (absolute mode) */
  value?: number
  min?: number
  max?: number
  color?: string
  /** absolute mode: report the new value */
  onChange?: (value: number) => void
  /** jog mode: report a relative delta (drag up = positive) */
  onJog?: (delta: number) => void
  /** drag sensitivity, units of value per pixel */
  sensitivity?: number
  display?: string
}

/**
 * Canvas knob in the spirit of the original jQuery-knob "tron" skin: a thin
 * outer ring with a teal value arc, drag vertically to change. Used for gain,
 * pitch (absolute) and the loop range jog (relative).
 *
 * Drag listeners are attached on pointerdown (not via an effect), so the
 * engine re-rendering mid-drag can't tear them out from under us.
 */
export function Knob({
  size,
  value = 0,
  min = 0,
  max = 100,
  color = '#21c1e1',
  onChange,
  onJog,
  sensitivity,
  display,
}: KnobProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const cx = size / 2
    const cy = size / 2
    const lineWidth = Math.max(3, size * 0.12)
    const radius = size / 2 - lineWidth

    const start = Math.PI * 0.75 // 135°
    const sweep = Math.PI * 1.5 // 270°
    const pct = onJog ? 0.5 : (value - min) / (max - min || 1)

    // outer ring
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, radius + lineWidth - 1, 0, Math.PI * 2)
    ctx.stroke()

    // track (unfilled portion) — dark so only the cyan value arc pops
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = '#2a3a42'
    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, start + sweep)
    ctx.stroke()

    // value arc
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, start + sweep * Math.max(0, Math.min(1, pct)))
    ctx.stroke()
  }, [size, value, min, max, color, onJog])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const startY = e.clientY
    const startValue = value
    let lastY = startY

    const onMove = (ev: PointerEvent) => {
      if (onJog) {
        // relative: emit the incremental delta and advance the reference
        const dy = lastY - ev.clientY
        lastY = ev.clientY
        onJog(dy * (sensitivity ?? 1))
        return
      }
      // absolute: derive from the total travel since pointerdown
      const dy = startY - ev.clientY
      const step = sensitivity ?? (max - min) / 150
      const next = Math.round(Math.max(min, Math.min(max, startValue + dy * step)))
      onChange?.(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="knob-wrap" style={{ position: 'relative', width: size, height: size }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        style={{ width: size, height: size, cursor: 'ns-resize', touchAction: 'none' }}
      />
      {display !== undefined && <span className="knob-value">{display}</span>}
    </div>
  )
}
