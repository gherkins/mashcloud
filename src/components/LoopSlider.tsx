import { useRef } from 'react'

interface LoopSliderProps {
  durationMs: number
  startMs: number
  endMs: number
  onChange: (startMs: number, endMs: number) => void
}

/**
 * Dual-handle loop selector. Reuses the original jQuery-UI slider class names
 * (.ui-slider-handle / .ui-slider-range) so the existing loop_start.png /
 * loop_end.png handle styling from style.css applies unchanged.
 */
export function LoopSlider({ durationMs, startMs, endMs, onChange }: LoopSliderProps) {
  const ref = useRef<HTMLDivElement>(null)

  const startPct = (startMs / durationMs) * 100
  const endPct = (endMs / durationMs) * 100

  const grab = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = ref.current
    if (!el) return

    const onMove = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      const ms = Math.round(pct * durationMs)
      if (which === 'start') onChange(Math.min(ms, endMs - 1), endMs)
      else onChange(startMs, Math.max(ms, startMs + 1))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={ref} className="slider loop ui-slider ui-slider-horizontal">
      <div
        className="ui-slider-range ui-slider-range-min"
        style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
      />
      <span
        className="ui-slider-handle"
        style={{ left: `${startPct}%` }}
        onPointerDown={grab('start')}
        role="slider"
        aria-label="loop start"
      />
      <span
        className="ui-slider-handle"
        style={{ left: `${endPct}%` }}
        onPointerDown={grab('end')}
        role="slider"
        aria-label="loop end"
      />
    </div>
  )
}
