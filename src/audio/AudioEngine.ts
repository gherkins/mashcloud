import { EngineTrack, type TrackSnapshot, type TrackMeta } from './EngineTrack'
import { encodeWav } from './wav'

export interface EngineSnapshot {
  tracks: TrackSnapshot[]
  playing: boolean
  recording: boolean
  ctxRunning: boolean
}

/**
 * A shareable, incremental edit. Broadcast to peers on local changes and
 * replayed on remote ones. Track add/remove of *audio* travels separately
 * (it needs bytes); these are the lightweight parameter edits.
 *
 * mute/solo and play/stop are intentionally NOT shared — they're personal
 * listening choices, exactly as in the original app.
 */
export type Edit =
  | { kind: 'loop'; id: string; startMs: number; endMs: number }
  | { kind: 'gain'; id: string; value: number }
  | { kind: 'pitch'; id: string; value: number }
  | { kind: 'master'; id: string }
  | { kind: 'remove'; id: string }

/**
 * The whole mixer. Web Audio graph + transport + the "master clock" loop sync
 * that the original app was built around: one track is the master, and whenever
 * its loop wraps, every track is restarted so they stay phase-locked to it.
 *
 * Exposes a useSyncExternalStore-compatible (subscribe, getSnapshot) pair so
 * React re-renders only on structural changes — the 60fps playhead is read
 * imperatively via getPositionPct() and never touches React state.
 */
export class AudioEngine {
  readonly ctx: AudioContext
  readonly masterGain: GainNode

  private tracks: EngineTrack[] = []
  private listeners = new Set<() => void>()
  private snap: EngineSnapshot = { tracks: [], playing: false, recording: false, ctxRunning: false }

  private playing = false
  private rafId = 0
  private transportStartTime = 0
  private lastMasterPhase = 0

  // collaboration hooks (wired up by the Collab layer; null when solo)
  onLocalEdit?: (edit: Edit) => void
  onLocalTrackAdded?: (track: EngineTrack) => void
  private suppress = false
  private incoming = new Set<string>()

  // recording
  private recording = false
  private processor: ScriptProcessorNode | null = null
  private readonly silentSink: GainNode
  private recL: Float32Array[] = []
  private recR: Float32Array[] = []

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()
    this.masterGain = this.ctx.createGain()
    this.masterGain.connect(this.ctx.destination)

    // silent sink keeps the recording ScriptProcessor pumping without
    // doubling the audible output.
    this.silentSink = this.ctx.createGain()
    this.silentSink.gain.value = 0
    this.silentSink.connect(this.ctx.destination)

    this.rebuildSnapshot()
  }

  // ---- React store glue -------------------------------------------------

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): EngineSnapshot => this.snap

  private rebuildSnapshot(): void {
    this.snap = {
      tracks: this.tracks.map((t) => t.snapshot()),
      playing: this.playing,
      recording: this.recording,
      ctxRunning: this.ctx.state === 'running',
    }
  }

  private emit(): void {
    this.rebuildSnapshot()
    for (const cb of this.listeners) cb()
  }

  // ---- tracks -----------------------------------------------------------

  anySoloActive(): boolean {
    return this.tracks.some((t) => t.solo)
  }

  getTracks(): readonly EngineTrack[] {
    return this.tracks
  }

  private applyAllGains(): void {
    for (const t of this.tracks) t.applyGain()
  }

  private broadcast(edit: Edit): void {
    if (!this.suppress) this.onLocalEdit?.(edit)
  }

  async addFiles(files: FileList | File[]): Promise<void> {
    // Snapshot synchronously: a live FileList (input.files) can be cleared by
    // the caller resetting the input before the awaits below run.
    const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name))
    await this.resume()
    for (const file of list) {
      try {
        const data = await file.arrayBuffer()
        // keep a copy of the encoded bytes BEFORE decode (decodeAudioData
        // detaches the ArrayBuffer); we re-send these bytes to peers.
        const bytes = new Uint8Array(data.slice(0))
        const buffer = await this.ctx.decodeAudioData(data)
        const name = file.name.replace(/\.[^.]+$/, '')
        const track = new EngineTrack(this, { name, buffer, bytes, master: this.tracks.length === 0 })
        this.tracks.push(track)
        track.applyGain()
        // if we're mid-playback, bring the newcomer in straight away; it locks
        // to the master at the next wrap.
        if (this.playing) track.play(this.ctx.currentTime + 0.02)
        // hand the new track (audio + meta) to peers
        this.onLocalTrackAdded?.(track)
      } catch (err) {
        console.error(`could not decode ${file.name}`, err)
      }
    }
    this.emit()
  }

  /** Rebuild a track from bytes received over the wire. Does not re-broadcast. */
  async addReceivedTrack(meta: TrackMeta, bytes: Uint8Array): Promise<void> {
    if (this.track(meta.id) || this.incoming.has(meta.id)) return // dedup
    this.incoming.add(meta.id)
    try {
      // decode works on a suspended context, so don't await resume() here — a
      // freshly-joined peer hasn't gestured yet and resume() could block.
      const buffer = await this.ctx.decodeAudioData(bytes.slice().buffer)
      if (meta.master) for (const t of this.tracks) t.master = false
      const track = new EngineTrack(this, {
        id: meta.id,
        name: meta.name,
        buffer,
        bytes,
        startMs: meta.startMs,
        endMs: meta.endMs,
        gain: meta.gain,
        pitch: meta.pitch,
        master: meta.master,
      })
      this.tracks.push(track)
      track.applyGain()
      if (this.playing) track.play(this.ctx.currentTime + 0.02)
      this.emit()
    } catch (err) {
      console.error(`could not decode received track ${meta.name}`, err)
    } finally {
      this.incoming.delete(meta.id)
    }
    void this.resume() // fire-and-forget; no-op until the user gestures
  }

  remove(id: string): void {
    const idx = this.tracks.findIndex((t) => t.id === id)
    if (idx === -1) return
    const [removed] = this.tracks.splice(idx, 1)
    const wasMaster = removed.master
    removed.dispose()
    this.broadcast({ kind: 'remove', id })
    if (wasMaster && this.tracks.length > 0) {
      this.tracks[0].master = true
      // tell peers explicitly who the new master is (track order may differ)
      this.broadcast({ kind: 'master', id: this.tracks[0].id })
    }
    this.applyAllGains()
    this.emit()
  }

  setGain(id: string, value: number): void {
    this.track(id)?.setGain(value)
    this.broadcast({ kind: 'gain', id, value })
    this.emit()
  }

  setPitch(id: string, value: number): void {
    this.track(id)?.setPitch(value)
    this.broadcast({ kind: 'pitch', id, value })
    this.emit()
  }

  setLoop(id: string, startMs: number, endMs: number): void {
    const t = this.track(id)
    if (!t) return
    t.setLoop(startMs, endMs)
    // broadcast the clamped values so peers land on the same window
    this.broadcast({ kind: 'loop', id, startMs: t.startMs, endMs: t.endMs })
    this.emit()
  }

  /** Relative nudge of one loop edge, reading the track's current window so
   *  repeated jogs accumulate instead of snapping back to a stale value. */
  nudgeLoop(id: string, edge: 'start' | 'end', deltaMs: number): void {
    const t = this.track(id)
    if (!t) return
    if (edge === 'start') t.setLoop(t.startMs + deltaMs, t.endMs)
    else t.setLoop(t.startMs, t.endMs + deltaMs)
    this.broadcast({ kind: 'loop', id, startMs: t.startMs, endMs: t.endMs })
    this.emit()
  }

  toggleMute(id: string): void {
    const t = this.track(id)
    if (!t) return
    t.mute = !t.mute
    this.applyAllGains()
    this.emit()
  }

  toggleSolo(id: string): void {
    const t = this.track(id)
    if (!t) return
    t.solo = !t.solo
    this.applyAllGains()
    this.emit()
  }

  setMaster(id: string): void {
    for (const t of this.tracks) t.master = t.id === id
    this.broadcast({ kind: 'master', id })
    this.emit()
  }

  /** Apply an edit received from a peer without echoing it back out. */
  applyRemoteEdit(edit: Edit): void {
    this.suppress = true
    try {
      switch (edit.kind) {
        case 'gain':
          this.setGain(edit.id, edit.value)
          break
        case 'pitch':
          this.setPitch(edit.id, edit.value)
          break
        case 'loop':
          this.setLoop(edit.id, edit.startMs, edit.endMs)
          break
        case 'master':
          this.setMaster(edit.id)
          break
        case 'remove':
          this.remove(edit.id)
          break
      }
    } finally {
      this.suppress = false
    }
  }

  private track(id: string): EngineTrack | undefined {
    return this.tracks.find((t) => t.id === id)
  }

  // ---- transport --------------------------------------------------------

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume()
      } catch {
        /* needs a user gesture; will resume on the next play/add */
      }
      this.emit()
    }
  }

  async play(): Promise<void> {
    if (this.playing || this.tracks.length === 0) return
    await this.resume()
    const when = this.ctx.currentTime + 0.06
    this.transportStartTime = when
    this.lastMasterPhase = 0
    for (const t of this.tracks) t.play(when)
    this.playing = true
    this.loop()
    this.emit()
  }

  stop(): void {
    if (!this.playing) return
    this.playing = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    for (const t of this.tracks) t.stopSource()
    this.emit()
  }

  toggleTransport(): void {
    if (this.playing) this.stop()
    else void this.play()
  }

  /** restart every track in lock-step — used when the master loop wraps. */
  private restartAll(): void {
    const when = this.ctx.currentTime + 0.02
    this.transportStartTime = when
    this.lastMasterPhase = 0
    for (const t of this.tracks) t.play(when)
  }

  private loop = (): void => {
    if (!this.playing) return
    this.rafId = requestAnimationFrame(this.loop)

    const elapsedMs = (this.ctx.currentTime - this.transportStartTime) * 1000
    if (elapsedMs < 0) return

    const master = this.tracks.find((t) => t.master)
    if (master) {
      const masterElapsed = elapsedMs * master.playbackRate
      const phase = masterElapsed % master.loopLenMs
      if (phase < this.lastMasterPhase) {
        this.restartAll()
        return
      }
      this.lastMasterPhase = phase
    }
  }

  /** 0..100 playhead percent for a track, or -1 when not playing. */
  getPositionPct(id: string): number {
    if (!this.playing) return -1
    const t = this.track(id)
    if (!t) return -1
    const elapsedMs = (this.ctx.currentTime - this.transportStartTime) * 1000
    if (elapsedMs < 0) return (t.startMs / t.durationMs) * 100
    return t.positionPct(elapsedMs)
  }

  // ---- recording --------------------------------------------------------

  async startRecording(): Promise<void> {
    if (this.recording) return
    await this.resume()
    this.recL = []
    this.recR = []
    const processor = this.ctx.createScriptProcessor(4096, 2, 2)
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      this.recL.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      this.recR.push(new Float32Array(e.inputBuffer.getChannelData(1)))
    }
    this.masterGain.connect(processor)
    processor.connect(this.silentSink)
    this.processor = processor
    this.recording = true
    this.emit()
  }

  stopRecording(): void {
    if (!this.recording || !this.processor) return
    this.masterGain.disconnect(this.processor)
    this.processor.disconnect()
    this.processor.onaudioprocess = null
    this.processor = null
    this.recording = false

    const left = flatten(this.recL)
    const right = flatten(this.recR)
    this.recL = []
    this.recR = []
    if (left.length > 0) {
      const wav = encodeWav([left, right], this.ctx.sampleRate)
      downloadBlob(wav, 'mashcloud-mix.wav')
    }
    this.emit()
  }

  toggleRecording(): void {
    if (this.recording) this.stopRecording()
    else void this.startRecording()
  }
}

function flatten(chunks: Float32Array[]): Float32Array {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Float32Array(len)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
