import { joinRoom, selfId } from 'trystero'
import type { AudioEngine, Edit } from '../audio/AudioEngine'
import type { TrackMeta } from '../audio/EngineTrack'

/** JSON value shape matching Trystero's payload/metadata constraint. */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json }
type SendOpts = {
  target?: string | string[] | null
  metadata?: Json
  onProgress?: (pct: number, ctx: { peerId: string; metadata?: Json }) => void
}

const APP_ID = 'mashcloud-net-v1'

/** This browser's stable peer id for the session. */
export const SELF_ID: string = selfId

export interface IncomingTransfer {
  id: string
  name: string
  pct: number
}

/**
 * Peer-to-peer collaboration over WebRTC, with Trystero handling signalling via
 * public Nostr relays (swap the import to trystero/mqtt|torrent to change it).
 *
 * Ephemeral by design: a session exists only while peers are connected — when
 * everyone leaves, it's gone. The URL is "join the live room", not "load a doc".
 *
 * Two streams share the datachannel:
 *  - 'edit'  : small JSON parameter edits (loop / gain / pitch / master / remove)
 *  - 'audio' : a track's encoded bytes + metadata, auto-chunked by Trystero,
 *              with progress reported for the receiving-side preloader.
 */
export class Collab {
  readonly roomId: string
  private engine: AudioEngine
  private room: ReturnType<typeof joinRoom>
  private sendEdit!: (data: Json, opts?: SendOpts) => Promise<void>
  private sendAudio!: (data: ArrayBufferView, opts?: SendOpts) => Promise<void>
  private peers = new Set<string>()

  /** notified when the connected-peer set changes */
  onPeers?: (peers: string[]) => void
  /** notified on incoming audio progress (pct 0..100) */
  onTransfer?: (t: IncomingTransfer) => void

  constructor(engine: AudioEngine, roomId: string) {
    this.engine = engine
    this.roomId = roomId
    this.room = joinRoom({ appId: APP_ID }, roomId)

    const editAction = this.room.makeAction('edit')
    const audioAction = this.room.makeAction('audio')
    this.sendEdit = editAction.send as typeof this.sendEdit
    this.sendAudio = audioAction.send as typeof this.sendAudio

    // ---- inbound ----
    editAction.onMessage = (data) => engine.applyRemoteEdit(data as unknown as Edit)

    audioAction.onMessage = (data, ctx) => {
      const meta = ctx.metadata as unknown as TrackMeta
      const bytes =
        data instanceof Uint8Array
          ? data
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array((data as ArrayBufferView).buffer)
      void engine.addReceivedTrack(meta, bytes)
    }
    audioAction.onReceiveProgress = (progress, ctx) => {
      const meta = ctx.metadata as unknown as TrackMeta | undefined
      if (meta) this.onTransfer?.({ id: meta.id, name: meta.name, pct: Math.round(progress * 100) })
    }

    // ---- outbound ----
    engine.onLocalEdit = (e) => void this.sendEdit(e as unknown as Json)
    engine.onLocalTrackAdded = (track) =>
      void this.sendAudio(track.bytes, { metadata: track.meta() as unknown as Json })

    // ---- presence ----
    this.room.onPeerJoin = (peerId) => {
      this.peers.add(peerId)
      this.onPeers?.(this.peerList())
      // exactly one existing peer seeds the newcomer (lowest id wins) so the
      // audio isn't transferred N times.
      if (this.isSeeder(peerId)) this.seedTo(peerId)
    }
    this.room.onPeerLeave = (peerId) => {
      this.peers.delete(peerId)
      this.onPeers?.(this.peerList())
    }
  }

  peerList(): string[] {
    return [...this.peers]
  }

  private isSeeder(newPeer: string): boolean {
    const all = [selfId, ...Object.keys(this.room.getPeers())].filter((id) => id !== newPeer)
    all.sort()
    return all[0] === selfId
  }

  private seedTo(peerId: string): void {
    for (const t of this.engine.getTracks()) {
      void this.sendAudio(t.bytes, { target: peerId, metadata: t.meta() as unknown as Json })
    }
  }

  leave(): void {
    this.engine.onLocalEdit = undefined
    this.engine.onLocalTrackAdded = undefined
    void this.room.leave()
  }
}
