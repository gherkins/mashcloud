import { createRoot } from 'react-dom/client'
import { AudioEngine } from './audio/AudioEngine'
import { App } from './App'

// Single engine (and single AudioContext) for the whole app. No StrictMode —
// double-mounting would spin up a second AudioContext.
const engine = new AudioEngine()

createRoot(document.getElementById('root')!).render(<App engine={engine} />)
