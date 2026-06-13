# mashcloud

A loop-based audio mixer for the browser. Drop your own audio files, set a loop
window per track, layer them, tweak gain & pitch, lock everything to a master
loop, and export the mix as a WAV.

This is a ground-up modern rebuild of **mashcloud.net**, a 2012 BA-thesis project
about collaborative, loop-based audio editing. The original layered loops from
**SoundCloud** and synced edits between users over **socket.io + MongoDB**.

Two things forced a rethink:

1. **SoundCloud's public API is closed** — registration has been shut since 2019
   and the old client IDs now return `401`, so the original audio source is gone.
2. The realtime-collab server (Express 2 / socket.io / MongoDB) was the only
   reason the app needed hosting at all, and hosting was why it went offline.

So this rebuild keeps the genuinely good parts — the Web Audio loop engine, the
realtime collaboration, and the original visual design — but drops the *server*:

- **Audio source:** your own local files (drag-drop or browse). Decoded in the
  browser with the Web Audio API; nothing is ever uploaded.
- **No server, no API keys, no database.** It's a fully static site that runs
  anywhere, including **GitHub Pages**.
- **Collaboration is back, peer-to-peer.** "Share session" spins up a WebRTC
  room (Trystero, public Nostr relays for signalling); collaborators join by URL
  and your tracks stream to them over the datachannel. No backend to host.
- **Same look:** the original CSS, font and imagery are reused verbatim; the
  markup is reproduced in React so the styling carries over.

## Stack

- React 18 + TypeScript + Vite (static build)
- Web Audio API (`AudioBufferSourceNode` loops, `GainNode` bus, master-clock
  re-sync, WAV export)
- [Trystero](https://github.com/dmotz/trystero) for serverless WebRTC P2P

The original was Node/Express + socket.io + MongoDB + Backbone/jQuery.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Then drag some audio files (wav/mp3/ogg/flac/m4a/aac/opus/webm/aiff) onto the
page, or click the top bar to browse. Whatever your browser's Web Audio decoder
can handle works; MP3s with a corrupted/junk header (common with partial
downloads) are repaired on the fly by resyncing to the first valid frame.

## Build / deploy

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

`dist/` is plain static files. `vite.config.ts` sets `base: './'` so the same
build works at a domain root or under a `/<repo>/` GitHub Pages path.

## How the engine works

- Each track owns a `GainNode` wired into a master bus; a fresh
  `AudioBufferSourceNode` is created on every (re)start (buffer sources are
  one-shot by spec).
- Each source loops its own `[loopStart, loopEnd]` window.
- One track is the **master**. It loops natively (seamless by spec); a
  `requestAnimationFrame` scheduler projects its next loop boundary from the
  audio clock and schedules every other track to re-trigger from its own
  loopStart *exactly* on that boundary sample (a short lookahead lands the start
  precisely), keeping them phase-locked to the master — the same trick the 2012
  app used, but sample-accurate, so there's no seam on wrap.
- The playhead is drawn imperatively per frame and never triggers a React
  render; React state only changes on structural edits (add/remove/gain/pitch/
  loop/mute/solo/transport).
- **Recording** taps the master bus and encodes 16-bit PCM WAV on stop.

## How collaboration works (peer-to-peer)

- **Share session** generates a room id, puts it in the URL (`#room=…`), and
  joins a Trystero room. Opening that URL auto-joins the room.
- Two streams ride the same WebRTC datachannel: small JSON **edits** (loop /
  gain / pitch / master / remove) and **audio** — a track's encoded bytes +
  metadata, auto-chunked by Trystero, with progress shown as a receiving bar.
- When a peer joins, exactly one existing peer (lowest id) **seeds** it all the
  current tracks; track ids are global so everyone dedupes consistently and
  remote edits are applied without echoing back.
- **mute / solo / play-stop are personal**, not shared — same as the 2012 app.
- **Ephemeral on purpose:** the session lives only while peers are connected.
  Everyone leaves → it's gone. The URL joins a live room, it doesn't load a
  saved document. (For durable, async sessions you'd add a small persistence
  layer — deliberately out of scope here.)
- Signalling uses public Nostr relays; swap the `trystero` import in
  `src/collab/Collab.ts` to `trystero/mqtt` or `trystero/torrent` to change it.

## Known limitations / next steps

- Recording uses `ScriptProcessorNode` (deprecated but universally supported).
  Upgrade path: `AudioWorklet`.
- P2P falls back to a TURN relay on restrictive networks (none configured by
  default); for cross-network reliability add `turnConfig` to the Trystero room.
- The layout is responsive and the knobs / loop handles are pointer-driven, so
  it's fully usable on touch. Two desktop-only niceties degrade gracefully:
  drag-and-drop (tap the bar to browse instead) and the hover help hints.
- A peer that joins after the last audio-holder left won't get that track —
  inherent to the ephemeral P2P model.

## Credits

- Design: [Daniel Althausen](https://www.behance.net/DanielAlthausen)

## License

MIT.
