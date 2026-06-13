import type { AudioEngine } from './AudioEngine'
import { computePeaks } from './peaks'

/** Plain, serialisable-ish view of a track that the React UI renders from. */
export interface TrackSnapshot {
  id: string
  name: string
  durationMs: number
  startMs: number
  endMs: number
  /** 0..150, applied as gain/100 (100 = unity, >100 = boost) */
  gain: number
  /** 50..150, applied as playbackRate = pitch/100 */
  pitch: number
  master: boolean
  mute: boolean
  solo: boolean
  playing: boolean
  peaks: Float32Array
}

/** Everything needed to (re)build a track — locally or from a peer. */
export interface TrackInit {
  /** globally-unique id; generated if absent. Preserved across peers. */
  id?: string
  name: string
  buffer: AudioBuffer
  /** the encoded file bytes, kept so we can re-seed peers that join later */
  bytes: Uint8Array
  startMs?: number
  endMs?: number
  gain?: number
  pitch?: number
  master?: boolean
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * One looping audio track. Owns its own gain node (wired into the engine's
 * master bus) and recreates a BufferSourceNode on every (re)start, exactly like
 * the original Backbone Track model — buffer sources are one-shot by spec.
 */
export class EngineTrack {
  readonly id: string
  name: string
  readonly buffer: AudioBuffer
  readonly bytes: Uint8Array
  readonly peaks: Float32Array

  startMs: number
  endMs: number
  gain: number
  pitch: number
  master: boolean
  mute = false
  solo = false
  playing = false

  private engine: AudioEngine
  private gainNode: GainNode
  private source: AudioBufferSourceNode | null = null

  constructor(engine: AudioEngine, init: TrackInit) {
    this.engine = engine
    this.id = init.id ?? uid()
    this.name = init.name
    this.buffer = init.buffer
    this.bytes = init.bytes
    this.peaks = computePeaks(init.buffer, 720)
    this.startMs = init.startMs ?? 0
    this.endMs = init.endMs ?? init.buffer.duration * 1000
    this.gain = init.gain ?? 100
    this.pitch = init.pitch ?? 100
    this.master = init.master ?? false

    this.gainNode = engine.ctx.createGain()
    this.gainNode.connect(engine.masterGain)
    this.applyGain()
  }

  get durationMs(): number {
    return this.buffer.duration * 1000
  }

  get loopLenMs(): number {
    return Math.max(1, this.endMs - this.startMs)
  }

  get playbackRate(): number {
    return this.pitch / 100
  }

  /** Effective gain, taking mute and any active solo into account. */
  applyGain(): void {
    const soloActive = this.engine.anySoloActive()
    const silenced = this.mute || (soloActive && !this.solo)
    this.gainNode.gain.value = silenced ? 0 : this.gain / 100
  }

  setGain(value: number): void {
    this.gain = value
    this.applyGain()
  }

  setPitch(value: number): void {
    this.pitch = value
    if (this.source) this.source.playbackRate.value = this.playbackRate
  }

  setLoop(startMs: number, endMs: number): void {
    this.startMs = Math.max(0, Math.min(startMs, this.durationMs))
    this.endMs = Math.max(this.startMs + 1, Math.min(endMs, this.durationMs))
    if (this.source) {
      this.source.loopStart = this.startMs / 1000
      this.source.loopEnd = this.endMs / 1000
    }
  }

  /** (Re)create the source node and start looping its window. */
  play(when: number): void {
    this.stopSource()
    const src = this.engine.ctx.createBufferSource()
    src.buffer = this.buffer
    src.loop = true
    src.loopStart = this.startMs / 1000
    src.loopEnd = this.endMs / 1000
    src.playbackRate.value = this.playbackRate
    src.connect(this.gainNode)
    src.start(when, this.startMs / 1000)
    this.source = src
    this.playing = true
  }

  stopSource(): void {
    if (this.source) {
      try {
        this.source.stop()
      } catch {
        /* already stopped */
      }
      this.source.disconnect()
      this.source = null
    }
    this.playing = false
  }

  dispose(): void {
    this.stopSource()
    this.gainNode.disconnect()
  }

  /** Playhead position as a 0..100 percentage of the full track duration. */
  positionPct(elapsedMs: number): number {
    const t = ((elapsedMs * this.playbackRate) % this.loopLenMs) + this.startMs
    return (t / this.durationMs) * 100
  }

  /** Lightweight metadata (no audio) shipped alongside the bytes to peers. */
  meta(): TrackMeta {
    return {
      id: this.id,
      name: this.name,
      startMs: this.startMs,
      endMs: this.endMs,
      gain: this.gain,
      pitch: this.pitch,
      master: this.master,
    }
  }

  snapshot(): TrackSnapshot {
    return {
      id: this.id,
      name: this.name,
      durationMs: this.durationMs,
      startMs: this.startMs,
      endMs: this.endMs,
      gain: this.gain,
      pitch: this.pitch,
      master: this.master,
      mute: this.mute,
      solo: this.solo,
      playing: this.playing,
      peaks: this.peaks,
    }
  }
}

/** Track metadata sent over the wire with the audio bytes. */
export interface TrackMeta {
  id: string
  name: string
  startMs: number
  endMs: number
  gain: number
  pitch: number
  master: boolean
}
