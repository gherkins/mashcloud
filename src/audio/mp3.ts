/**
 * Find where the real MPEG-audio stream starts inside a buffer.
 *
 * The browser's `decodeAudioData` identifies a file only from its leading
 * bytes, so a perfectly valid MP3 with garbage prepended — a corrupted or
 * partial download, a scrambled header — is rejected with "unknown content
 * type". VLC, ffmpeg and macOS CoreAudio all play such files anyway, because
 * they scan ahead to the first frame sync. This does the same: it returns the
 * offset of the first MP3 frame (corroborated by a second frame right after it)
 * so the caller can trim the junk and decode like every other player does.
 *
 * Returns 0 when the buffer already starts cleanly (an ID3v2 tag or a frame at
 * offset 0 — nothing to trim), or -1 when no MP3 stream can be found.
 */

// Bitrate tables in kbps, indexed [versionGroup][layerBits][bitrateIndex].
// Index 0 (free) and 15 (invalid) are treated as 0 → rejected.
const BITRATES: Record<number, Record<number, number[]>> = {
  1: {
    // MPEG 1
    3: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0], // Layer I
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0], // Layer II
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0], // Layer III
  },
  2: {
    // MPEG 2 / 2.5
    3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0], // Layer I
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0], // Layer II
    1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0], // Layer III
  },
}

// Sample rates in Hz, indexed [versionBits][sampleRateIndex].
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000, 0], // MPEG 1
  2: [22050, 24000, 16000, 0], // MPEG 2
  0: [11025, 12000, 8000, 0], // MPEG 2.5
}

/** Length in bytes of the MPEG frame whose header begins at `i`, or 0 if the
 *  4 bytes there aren't a valid frame header. */
function frameLength(bytes: Uint8Array, i: number): number {
  if (i + 4 > bytes.length) return 0
  const b1 = bytes[i + 1]
  const b2 = bytes[i + 2]
  if (bytes[i] !== 0xff || (b1 & 0xe0) !== 0xe0) return 0 // 11-bit frame sync

  const versionBits = (b1 >> 3) & 0x3 // 11=MPEG1, 10=MPEG2, 00=MPEG2.5, 01=reserved
  const layerBits = (b1 >> 1) & 0x3 // 11=I, 10=II, 01=III, 00=reserved
  if (versionBits === 1 || layerBits === 0) return 0

  const bitrateIndex = (b2 >> 4) & 0xf
  const sampleRateIndex = (b2 >> 2) & 0x3
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return 0
  const padding = (b2 >> 1) & 0x1

  const versionGroup = versionBits === 3 ? 1 : 2
  const bitrate = BITRATES[versionGroup][layerBits][bitrateIndex] * 1000
  const sampleRate = SAMPLE_RATES[versionBits][sampleRateIndex]
  if (!bitrate || !sampleRate) return 0

  if (layerBits === 3) {
    // Layer I: 4-byte slots
    return Math.floor((12 * bitrate) / sampleRate + padding) * 4
  }
  // Layer II = 1152 samples; Layer III = 1152 (MPEG1) or 576 (MPEG2/2.5)
  const samples = layerBits === 1 && versionBits !== 3 ? 576 : 1152
  return Math.floor((samples / 8) * (bitrate / sampleRate)) + padding
}

export function findMpegFrameStart(bytes: Uint8Array): number {
  // ID3v2 tag — decoders accept it directly, so there's nothing to trim.
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 0

  // Scanning the first 256 KB finds any realistic junk header; bail beyond that.
  const limit = Math.min(bytes.length - 4, 256 * 1024)
  for (let i = 0; i <= limit; i++) {
    if (bytes[i] !== 0xff) continue
    const len = frameLength(bytes, i)
    if (len < 4) continue
    // Corroborate: require a second frame right after this one (or EOF), so a
    // stray 0xFF in the junk can't masquerade as a frame start.
    const next = i + len
    if (next + 4 > bytes.length || frameLength(bytes, next) >= 4) return i
  }
  return -1
}
