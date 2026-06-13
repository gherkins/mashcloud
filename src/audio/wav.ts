/**
 * Encode interleaved/planar Float32 channel data into a 16-bit PCM WAV blob.
 * Mirrors what the original recorder.js did, minus the worker — the recordings
 * here are short loop jams, so a synchronous encode on stop is fine.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length
  const numFrames = channels[0]?.length ?? 0
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  // fmt chunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true)
  // data chunk
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // interleave + convert to 16-bit signed
  let offset = 44
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][frame]
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([view], { type: 'audio/wav' })
}
