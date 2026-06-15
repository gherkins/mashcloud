# mashcloud

A loop-based audio mixer for the browser. Drop in your own audio, set a loop
window per track, layer them, tweak gain & pitch, lock everything to a master
loop, and export the mix as a WAV. Everything runs in your browser — nothing is
uploaded.

## Features

- **Bring your own audio.** Drag-drop or browse for files (wav / mp3 / ogg /
  flac / m4a / aac / opus / webm / aiff). Decoded locally with the Web Audio
  API; nothing leaves your machine. MP3s with a corrupted/junk header (common
  with partial downloads) are repaired on the fly.
- **Per-track loop windows.** Set a loop start/end on each track and stack as
  many tracks as you like.
- **Gain & pitch.** Adjust every track independently with pointer-driven knobs
  and loop handles — works with mouse or touch.
- **Sample-accurate master loop.** Pick one track as the master; every other
  track re-triggers exactly on its loop boundary, so layers stay phase-locked
  with no seam on wrap.
- **Mute, solo & transport** per track.
- **WAV export.** Record the mix and download a 16-bit PCM WAV.
- **Real-time collaboration, peer-to-peer.** "Share session" opens a WebRTC
  room; collaborators join by URL and your tracks stream straight to them.
  Edits (loop / gain / pitch / master) sync live, while mute / solo / play-stop
  stay personal. No account, no backend — the session lives only while peers
  are connected.
- **Fully static.** No server, no API keys, no database. Runs anywhere,
  including GitHub Pages.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Then drag some audio onto the page, or click the top bar to browse.

## Build

```bash
npm run build    # static files in dist/
npm run preview  # serve the production build locally
```

`vite.config.ts` sets `base: './'`, so the same build works at a domain root or
under a `/<repo>/` GitHub Pages path.

## Stack

- React 18 + TypeScript + Vite
- Web Audio API (looping sources, gain bus, master-clock re-sync, WAV export)
- [Trystero](https://github.com/dmotz/trystero) for serverless WebRTC P2P

## Credits

- Design: [Daniel Althausen](https://www.behance.net/DanielAlthausen)

## License

MIT.
