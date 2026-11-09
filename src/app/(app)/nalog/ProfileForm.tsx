'use client';
import { useMemo, useState } from 'react';
import { ComboField } from '@/components/ui/ComboField';
import { updateOwnProfile } from '@/lib/auth/actions';
import { sr } from '@/lib/i18n/sr';
import { zoneNames } from '@/lib/time/zone';

const t = sr.account;

/** Name and default zone; the zone field searches the IANA zone list. */
export function ProfileForm({ name, tz }: { name: string; tz: string }) {
  const [zone, setZone] = useState(tz);
  const zones = useMemo(() => zoneNames(tz), [tz]);
  return (
    <form action={updateOwnProfile} className="stack">
      <label>
        {t.name}
        <input name="displayName" defaultValue={name} required autoComplete="name" />
      </label>
      <ComboField label={t.tz} name="tz" value={zone} onChange={setZone} suggestions={zones} description={t.tzHint} />
      <button type="submit">{t.save}</button>
    </form>
  );
}
