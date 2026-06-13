/**
 * Downsample a decoded AudioBuffer into a fixed number of absolute-value peaks,
 * for drawing a static waveform. The original app used SoundCloud's pre-rendered
 * waveform image; with local files we render our own from the samples.
 */
export function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const channel = buffer.getChannelData(0)
  const block = Math.max(1, Math.floor(channel.length / buckets))
  const peaks = new Float32Array(buckets)

  for (let i = 0; i < buckets; i++) {
    let max = 0
    const offset = i * block
    for (let j = 0; j < block; j++) {
      const v = Math.abs(channel[offset + j] || 0)
      if (v > max) max = v
    }
    peaks[i] = max
  }
  return peaks
}
