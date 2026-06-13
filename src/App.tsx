import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from './audio/AudioEngine'
import { useEngine } from './state/useEngine'
import { Track } from './components/Track'
import { Collab, type IncomingTransfer } from './collab/Collab'

/** mouseover help, carried over from the original _help.html (reworded for the
 *  local-files, no-server build). */
const HELP: Record<string, string> = {
  search: 'Drop audio files anywhere on the page, or click this bar to browse. Files are decoded in your browser and never uploaded.',
  start_stop: 'Play / stop all loops. The spacebar works too.',
  session_title: 'Name your jam. Purely cosmetic in this offline build.',
  gain: 'Drag to set a track’s volume.',
  pitch: 'Drag to change playback rate & pitch together.',
  range: 'Fine-nudge the selected loop edge (start or end).',
  range_start: 'Select the loop start point so the range knob nudges it.',
  range_end: 'Select the loop end point so the range knob nudges it.',
  loop: 'The waveform. Drag the start/end handles to set the loop window.',
  mute: 'Mute this track.',
  solo: 'Solo this track (mutes everything else).',
  master: 'Exactly one track is the master: when its loop wraps, every track restarts so they stay locked together.',
  delete: 'Remove this track.',
  record: 'Record the main output (everything you hear). A WAV downloads when you stop.',
  server_status: 'Audio engine status. Lights green once the Web Audio context is running (after your first click).',
  share: 'Start a live peer-to-peer session and copy the link. Anyone who opens it joins and gets your tracks streamed over WebRTC — no server, no upload.',
  users: 'Everyone currently connected. The session is peer-to-peer and lives only while someone is here — it’s gone once everyone leaves.',
}

/** short, stable display name for a peer id */
function peerName(id: string): string {
  return `guest-${id.slice(0, 4)}`
}

function roomIdFromHash(): string | null {
  const m = /(?:^|[#&])room=([A-Za-z0-9_-]+)/.exec(window.location.hash)
  return m ? m[1] : null
}

function newRoomId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 8)
}

export function App({ engine }: { engine: AudioEngine }) {
  const snap = useEngine(engine)
  const fileInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('Untitled Session')
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpText, setHelpText] = useState('')
  const [dragging, setDragging] = useState(false)

  // collaboration
  const collabRef = useRef<Collab | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [peers, setPeers] = useState<string[]>([])
  const [transfers, setTransfers] = useState<Record<string, IncomingTransfer>>({})
  const [copied, setCopied] = useState(false)

  const startCollab = (id: string) => {
    if (collabRef.current) return
    const c = new Collab(engine, id)
    c.onPeers = (p) => setPeers(p)
    c.onTransfer = (t) =>
      setTransfers((prev) => {
        const next = { ...prev }
        if (t.pct >= 100) delete next[t.id]
        else next[t.id] = t
        return next
      })
    collabRef.current = c
    setRoomId(id)
  }

  const shareSession = () => {
    const id = roomIdFromHash() ?? newRoomId()
    window.location.hash = `room=${id}`
    startCollab(id)
  }

  const copyLink = () => {
    void navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  // auto-join if the URL already names a room
  useEffect(() => {
    const id = roomIdFromHash()
    if (id) startCollab(id)
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // spacebar = play/stop (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      e.preventDefault()
      engine.toggleTransport()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  // only show transfers for tracks that haven't fully arrived yet
  const incoming = Object.values(transfers).filter((t) => !snap.tracks.some((tr) => tr.id === t.id))

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void engine.addFiles(e.target.files)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) void engine.addFiles(e.dataTransfer.files)
  }

  // delegated inline help
  const onHelpOver = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.inlinehelp') as HTMLElement | null
    const id = el?.dataset.id
    if (id && HELP[id]) setHelpText(HELP[id])
  }
  const onHelpOut = () => setHelpText('')

  return (
    <div
      className="container"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className={`main${dragging ? ' dragging' : ''}`} onMouseOver={onHelpOver} onMouseOut={onHelpOut}>
        <input ref={fileInput} type="file" accept="audio/*" multiple hidden onChange={onPickFiles} />

        <div className="header">
          <div className="wrap">
            <div className="logo">
              <a href="#">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="mashcloud" />
              </a>
            </div>
            <input
              type="text"
              className="add_track inlinehelp"
              data-id="search"
              readOnly
              value=""
              placeholder="drop audio files anywhere, or click here to browse…"
              onClick={() => fileInput.current?.click()}
            />
          </div>
        </div>

        <div className="content session">
          <div className="wrap">
            {/* sidebar */}
            <div className="sidebar">
              <div className="widget inlinehelp" data-id="server_status">
                <div className="connection">
                  <div className="off" />
                  <div className={`on${snap.ctxRunning ? ' active' : ''}`} />
                </div>
                <h4>engine status</h4>
              </div>

              {/* collaboration */}
              <div className="widget collab inlinehelp" data-id="share">
                {!roomId ? (
                  <a
                    href="#"
                    className="button share"
                    onClick={(e) => {
                      e.preventDefault()
                      shareSession()
                    }}
                  >
                    share<br />session
                  </a>
                ) : (
                  <>
                    <h4>session link</h4>
                    <input
                      className="share-url"
                      readOnly
                      value={window.location.hash}
                      title={window.location.href}
                      onFocus={(e) => e.target.select()}
                    />
                    <a
                      href="#"
                      className="button copy"
                      onClick={(e) => {
                        e.preventDefault()
                        copyLink()
                      }}
                    >
                      {copied ? 'copied!' : 'copy link'}
                    </a>
                  </>
                )}
              </div>

              {roomId && (
                <div className="widget users-widget inlinehelp" data-id="users">
                  <h4>users in session</h4>
                  <div className="users">
                    <div className="user you">
                      <span className="name">you</span>
                      <span className="status">&hellip;online</span>
                    </div>
                    {peers.map((p) => (
                      <div className="user" key={p}>
                        <span className="name">{peerName(p)}</span>
                        <span className="status">&hellip;online</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {incoming.length > 0 && (
                <div className="widget incoming">
                  <h4>receiving audio</h4>
                  {incoming.map((t) => (
                    <div className="xfer" key={t.id}>
                      <span className="xfer-name">{t.name}</span>
                      <span className="xfer-pct">{t.pct}%</span>
                      <span className="xfer-bar" style={{ width: `${t.pct}%` }} />
                    </div>
                  ))}
                </div>
              )}

              <div className="widget rec inlinehelp" data-id="record">
                <a
                  href="#"
                  className="button record"
                  onClick={(e) => {
                    e.preventDefault()
                    engine.toggleRecording()
                  }}
                  dangerouslySetInnerHTML={{
                    __html: snap.recording ? 'stop<br>recording' : 'start<br>recording',
                  }}
                />
              </div>

              <div className="widget help">
                {!helpOpen && (
                  <a
                    href="#"
                    className="button show toggle"
                    onClick={(e) => {
                      e.preventDefault()
                      setHelpOpen(true)
                    }}
                  >
                    help!
                  </a>
                )}
                {helpOpen && (
                  <>
                    <h4 className="toggle">
                      <a
                        className="hide"
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          setHelpOpen(false)
                        }}
                      />
                      help
                    </h4>
                    {!helpText && (
                      <div className="hint toggle">
                        <p>mouseover things and get help here</p>
                      </div>
                    )}
                    {helpText && <div className="helptext toggle"><p>{helpText}</p></div>}
                  </>
                )}
              </div>
            </div>

            {/* main column */}
            <div className="left">
              <div className="top transport">
                <a
                  href="#"
                  className={`button transport ${snap.playing ? 'stop' : 'play'} inlinehelp`}
                  data-id="start_stop"
                  onClick={(e) => {
                    e.preventDefault()
                    engine.toggleTransport()
                  }}
                >
                  <span>{snap.playing ? 'stop' : 'play'}</span>
                </a>
                <input
                  type="text"
                  id="session_title"
                  className="inlinehelp"
                  data-id="session_title"
                  placeholder="session title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="tracks">
                {snap.tracks.length === 0 && (
                  <div className="quickstart" style={{ display: 'block' }}>
                    <p>
                      <span className="empty">You don’t have any tracks yet.</span>
                      <br />
                      Drop audio files anywhere on the page, or{' '}
                      <a href="#" onClick={(e) => { e.preventDefault(); fileInput.current?.click() }}>
                        browse for files
                      </a>
                      . Everything is processed locally in your browser.
                    </p>
                  </div>
                )}
                {snap.tracks.map((t) => (
                  <Track key={t.id} engine={engine} track={t} />
                ))}
              </div>
            </div>

            <div className="clear" />
          </div>
        </div>
      </div>

      <div className="footer">
        <div className="wrap">
          <a href="https://github.com/" target="_blank" rel="noreferrer">
            about / source
          </a>
        </div>
      </div>
    </div>
  )
}
