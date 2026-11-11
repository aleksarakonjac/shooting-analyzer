'use client';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { Segmented } from '@/components/ui/Segmented';
import { sr } from '@/lib/i18n/sr';
import { AUTOPLAYS, COLOUR_PRESETS, DEFAULT_HIT, DEFAULT_TRACE_COLOURS, HIT_SWATCHES, OVERLAY_KEYS, SEGMENT_KINDS, useReplaySettings, type OverlayKey } from './replaySettings';

const t = sr.report;

/** The cog at the corner of the aim-trace view: which figures to draw over the target, colours, and autoplay. */
export function TraceSettings() {
  const s = useReplaySettings();
  if (!s) return null;
  const toggle = (k: OverlayKey) => s.set({ overlay: s.overlay.includes(k) ? s.overlay.filter((x) => x !== k) : [...s.overlay, k] });
  const move = (k: OverlayKey, d: -1 | 1) => {
    const i = s.overlay.indexOf(k);
    const j = i + d;
    if (i < 0 || j < 0 || j >= s.overlay.length) return;
    const next = [...s.overlay];
    [next[i], next[j]] = [next[j], next[i]];
    s.set({ overlay: next });
  };
  // Chosen figures first, in their order; the rest below.
  const rows = [...s.overlay, ...OVERLAY_KEYS.filter((k) => !s.overlay.includes(k))];
  return (
    <DialogTrigger>
      <Button className="trace__cog" aria-label={t.viewSettings} data-tooltip={t.viewSettings}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5.5h6.5M13.5 5.5H17M3 10h2.5M9.5 10H17M3 14.5h7.5M14.5 14.5H17" />
          <circle cx="11.5" cy="5.5" r="1.9" />
          <circle cx="7.5" cy="10" r="1.9" />
          <circle cx="12.5" cy="14.5" r="1.9" />
        </svg>
      </Button>
      <Popover className="ui-popover more__pop" placement="top end" offset={8}>
        <Dialog className="more" aria-label={t.viewSettings}>
          <section className="more__section" aria-labelledby="ts-overlay">
            <h3 id="ts-overlay" className="more__title">{t.overlayTitle}</h3>
            <ul className="ts__order">
              {rows.map((k) => {
                const on = s.overlay.includes(k);
                const i = s.overlay.indexOf(k);
                return (
                  <li key={k} className="ts__orderrow">
                    <label className="check">
                      <input type="checkbox" checked={on} onChange={() => toggle(k)} /> {t.overlayKeys[k]}
                    </label>
                    {on && (
                      <span className="ts__arrows">
                        <button type="button" className="scopebar__arrow" onClick={() => move(k, -1)} disabled={i === 0} aria-label={`${t.overlayKeys[k]}: ${t.moveUp}`} title={t.moveUp}>
                          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
                        </button>
                        <button type="button" className="scopebar__arrow" onClick={() => move(k, 1)} disabled={i === s.overlay.length - 1} aria-label={`${t.overlayKeys[k]}: ${t.moveDown}`} title={t.moveDown}>
                          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="more__help">{t.overlayOrderHelp}</p>
          </section>
          <section className="more__section" aria-labelledby="ts-hit">
            <h3 id="ts-hit" className="more__title">{t.hitColour}</h3>
            <div className="ts__swatches" role="group" aria-label={t.hitColour}>
              {HIT_SWATCHES.map((c) => (
                <button key={c} type="button" className="ts__swatch" style={{ background: c }} aria-label={c} aria-pressed={s.hit.toLowerCase() === c} onClick={() => s.set({ hit: c })} />
              ))}
              <input type="color" className="ts__picker" aria-label={t.customColour} value={s.hit} onChange={(e) => s.set({ hit: e.target.value })} />
            </div>
          </section>
          <section className="more__section" aria-labelledby="ts-trace">
            <h3 id="ts-trace" className="more__title">{t.traceColoursTitle}</h3>
            <div className="ts__presets" role="group" aria-label={t.paletteLabel}>
              {(Object.keys(COLOUR_PRESETS) as (keyof typeof COLOUR_PRESETS)[]).map((k) => (
                <button key={k} type="button" className="button--quiet ts__preset" onClick={() => s.set({ colours: COLOUR_PRESETS[k] })}>
                  <span className="ts__chips" aria-hidden="true">
                    {SEGMENT_KINDS.map((seg) => <i key={seg} style={{ background: COLOUR_PRESETS[k][seg] }} />)}
                  </span>
                  {t.palettes[k]}
                </button>
              ))}
            </div>
            <div className="ts__rows">
              {SEGMENT_KINDS.map((seg) => (
                <label key={seg} className="ts__row">
                  <span>{t.traceLegend[seg]}</span>
                  <input type="color" className="ts__picker" value={s.colours[seg]} onChange={(e) => s.set({ colours: { ...s.colours, [seg]: e.target.value } })} />
                </label>
              ))}
            </div>
            <button type="button" className="button--quiet" onClick={() => s.set({ hit: DEFAULT_HIT, colours: DEFAULT_TRACE_COLOURS })}>{t.resetColours}</button>
          </section>
          <section className="more__section" aria-labelledby="ts-auto">
            <h3 id="ts-auto" className="more__title">{t.autoplayTitle}</h3>
            <Segmented label={t.autoplayTitle} hideLabel full={false} value={s.autoplay} onChange={(autoplay) => s.set({ autoplay })} options={AUTOPLAYS.map((k) => ({ id: k, label: t.autoplays[k] }))} />
          </section>
          <p className="more__help">{t.traceSettingsHelp}</p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
