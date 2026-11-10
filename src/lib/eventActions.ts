'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Renames an event and sets its place and dates. RLS decides who may. */
export async function updateEventForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const place = String(form.get('place') ?? '').trim();
  const day = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const startsOn = day('starts_on');
  const endsOn = day('ends_on');
  if (!name || (startsOn && endsOn && endsOn < startsOn)) redirect(`/dogadjaj/${id}?greska=1`);
  const supabase = await createClient();
  const { error } = await supabase.from('events').update({ name, place, starts_on: startsOn, ends_on: endsOn }).eq('id', id);
  if (error) redirect(`/dogadjaj/${id}?greska=1`);
  revalidatePath(`/dogadjaj/${id}`);
  redirect(`/dogadjaj/${id}?sacuvano=1`);
}
