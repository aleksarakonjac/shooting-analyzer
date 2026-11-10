'use client';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { Segmented } from '@/components/ui/Segmented';
import { sr } from '@/lib/i18n/sr';
import { AUTOPLAYS, HIT_COLOURS, OVERLAY_KEYS, PALETTES, useReplaySettings, type HitColour, type OverlayKey } from './replaySettings';

const t = sr.report;

/** The cog at the corner of the aim-trace view: which figures to draw over the target, colours, and autoplay. */
export function TraceSettings() {
  const s = useReplaySettings();
  if (!s) return null;
  const toggle = (k: OverlayKey) => s.set({ overlay: s.overlay.includes(k) ? s.overlay.filter((x) => x !== k) : OVERLAY_KEYS.filter((x) => x === k || s.overlay.includes(x)) });
  return (
    <DialogTrigger>
      <Button className="trace__cog" aria-label={t.viewSettings} data-tooltip={t.viewSettings}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
      </Button>
      <Popover className="ui-popover more__pop" placement="top end" offset={8}>
        <Dialog className="more" aria-label={t.viewSettings}>
          <section className="more__section" aria-labelledby="ts-overlay">
            <h3 id="ts-overlay" className="more__title">{t.overlayTitle}</h3>
            <div className="ts__checks">
              {OVERLAY_KEYS.map((k) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={s.overlay.includes(k)} onChange={() => toggle(k)} /> {t.overlayKeys[k]}
                </label>
              ))}
            </div>
          </section>
          <section className="more__section" aria-labelledby="ts-colours">
            <h3 id="ts-colours" className="more__title">{t.coloursTitle}</h3>
            <Segmented label={t.hitColour} full={false} value={s.hit} onChange={(hit) => s.set({ hit })} options={(Object.keys(HIT_COLOURS) as HitColour[]).map((k) => ({ id: k, label: t.hitColours[k] }))} />
            <Segmented label={t.paletteLabel} full={false} value={s.palette} onChange={(palette) => s.set({ palette })} options={PALETTES.map((k) => ({ id: k, label: t.palettes[k] }))} />
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
