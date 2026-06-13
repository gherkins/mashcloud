import { useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'
import type { TrackSnapshot } from '../audio/EngineTrack'
import { Waveform } from './Waveform'
import { LoopSlider } from './LoopSlider'
import { Knob } from './Knob'

interface TrackProps {
  engine: AudioEngine
  track: TrackSnapshot
}

function formatTime(ms: number, withMs: boolean): string {
  const date = new Date(ms)
  let str = `${`0${date.getUTCMinutes()}`.slice(-2)}:${`0${date.getUTCSeconds()}`.slice(-2)}`
  if (withMs) str += `:${`000${date.getUTCMilliseconds()}`.slice(-3)}`
  return str
}

/** One track row — faithful rebuild of the original _track_template.html. */
export function Track({ engine, track }: TrackProps) {
  const [edge, setEdge] = useState<'start' | 'end'>('start')

  const jogEdge = (deltaMs: number) => engine.nudgeLoop(track.id, edge, deltaMs)

  return (
    <div className="track">
      <div className="wrap_narrow">
        <a
          className="remove inlinehelp"
          data-id="delete"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            engine.remove(track.id)
          }}
        >
          delete
        </a>

        <h3>
          {track.name}&nbsp;<span>({formatTime(track.durationMs, false)})</span>
        </h3>

        <div className="seek inlinehelp" data-id="loop">
          <Waveform
            engine={engine}
            trackId={track.id}
            peaks={track.peaks}
            startMs={track.startMs}
            endMs={track.endMs}
            durationMs={track.durationMs}
          />
          <LoopSlider
            durationMs={track.durationMs}
            startMs={track.startMs}
            endMs={track.endMs}
            onChange={(s, e) => engine.setLoop(track.id, s, e)}
          />
        </div>

        <div className="controls">
          <div className="knobs">
            <div className="knobcontainer gain inlinehelp" data-id="gain">
              <label>gain</label>
              <Knob
                size={52}
                value={track.gain}
                min={0}
                max={150}
                display={String(track.gain)}
                onChange={(v) => engine.setGain(track.id, v)}
              />
            </div>
            <div className="knobcontainer pitch inlinehelp" data-id="pitch">
              <label>pitch</label>
              <Knob
                size={52}
                value={track.pitch}
                min={50}
                max={150}
                display={String(track.pitch)}
                onChange={(v) => engine.setPitch(track.id, v)}
              />
            </div>
            <div className="knobcontainer range inlinehelp" data-id="range">
              <label>range</label>
              <Knob size={48} onJog={jogEdge} sensitivity={10} />
            </div>
            <div className="clear" />
          </div>

          <div className="loop" data-move={edge}>
            <a
              className="loop_start inlinehelp"
              data-id="range_start"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setEdge('start')
              }}
            >
              <span className="start">{formatTime(track.startMs, true)}</span>
              <span>start</span>
              <span className="clear" />
            </a>
            <a
              className="loop_end inlinehelp"
              data-id="range_end"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setEdge('end')
              }}
            >
              <span className="end">{formatTime(track.endMs, true)}</span>
              <span>end</span>
              <span className="clear" />
            </a>
          </div>

          <div className="buttons">
            <a
              className={`button mute inlinehelp${track.mute ? ' active' : ''}`}
              data-id="mute"
              onClick={() => engine.toggleMute(track.id)}
            >
              mute
            </a>
            <a
              className={`button solo inlinehelp${track.solo ? ' active' : ''}`}
              data-id="solo"
              onClick={() => engine.toggleSolo(track.id)}
            >
              solo
            </a>
            <a
              className={`button master inlinehelp${track.master ? ' active' : ''}`}
              data-id="master"
              onClick={() => engine.setMaster(track.id)}
            >
              master
            </a>
          </div>
          <div className="clear" />
        </div>
      </div>
    </div>
  )
}
