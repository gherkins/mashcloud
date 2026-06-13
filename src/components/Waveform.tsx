import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'

interface WaveformProps {
  engine: AudioEngine
  trackId: string
  peaks: Float32Array
  startMs: number
  endMs: number
  durationMs: number
}

const WIDTH = 720
const HEIGHT = 40

/**
 * Static waveform + live playhead. The waveform is drawn once from the peaks;
 * the playhead runs its own requestAnimationFrame and reads the engine
 * imperatively, so it never triggers a React render.
 */
export function Waveform({ engine, trackId, peaks, startMs, endMs, durationMs }: WaveformProps) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLCanvasElement>(null)

  // (re)draw the static waveform + loop region whenever the window changes
  useEffect(() => {
    const canvas = baseRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, WIDTH, HEIGHT)

    const mid = HEIGHT / 2
    const startX = (startMs / durationMs) * WIDTH
    const endX = (endMs / durationMs) * WIDTH

    // light waveform over the teal .wav background, dimmed outside the loop —
    // echoes the original SoundCloud waveform-mask look.
    for (let x = 0; x < peaks.length && x < WIDTH; x++) {
      const h = peaks[x] * (HEIGHT * 0.95)
      const inLoop = x >= startX && x <= endX
      ctx.strokeStyle = inLoop ? '#eaf6f4' : '#4f9f99'
      ctx.beginPath()
      ctx.moveTo(x + 0.5, mid - h / 2)
      ctx.lineTo(x + 0.5, mid + h / 2)
      ctx.stroke()
    }
  }, [peaks, startMs, endMs, durationMs])

  // playhead loop
  useEffect(() => {
    const canvas = cursorRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      const pct = engine.getPositionPct(trackId)
      if (pct < 0) return
      const x = (pct / 100) * WIDTH
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, HEIGHT)
      ctx.stroke()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [engine, trackId])

  return (
    <div className="wav">
      <canvas ref={baseRef} width={WIDTH} height={HEIGHT} />
      <canvas ref={cursorRef} className="cursor" width={WIDTH} height={HEIGHT} />
    </div>
  )
}
