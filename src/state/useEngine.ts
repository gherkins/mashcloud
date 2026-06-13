import { useSyncExternalStore } from 'react'
import type { AudioEngine, EngineSnapshot } from '../audio/AudioEngine'

/** Subscribe a component to the engine's structural state. */
export function useEngine(engine: AudioEngine): EngineSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot)
}
