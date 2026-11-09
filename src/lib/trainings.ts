'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { purgeTraining } from '@/lib/trash/purge';
import { parseSessionEdit } from '@/lib/sessions/edit';

/**
 * The session editor: name, place, notes, type, part, event, day, time and venue zone. RLS decides who may.
 * The event is found by name among the shooter's events of the same type, or created on the session's day.
 */
export async function updateTrainingForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const parsed = parseSessionEdit(form);
  if (!parsed.ok) redirect(`/trening/${id}?izmena=1&greska=1`);
  const { patch, eventName } = parsed;
  const supabase = await createClient();
  const { data: row } = await supabase.from('trainings').select('shooter_id').eq('id', id).maybeSingle();
  if (!row) redirect('/');
  let eventId: string | null = null;
  if (eventName) {
    const { data: found } = await supabase
      .from('events')
      .select('id, name')
      .eq('shooter_id', row.shooter_id)
      .eq('kind', patch.kind);
    const hit = (found ?? []).find((e) => e.name.toLocaleLowerCase('sr') === eventName.toLocaleLowerCase('sr'));
    if (hit) eventId = hit.id;
    else {
      const { data: made, error } = await supabase
        .from('events')
        .insert({ shooter_id: row.shooter_id, kind: patch.kind, name: eventName, place: patch.place, starts_on: patch.trained_on, ends_on: patch.trained_on })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      eventId = made.id;
    }
  }
  const { error } = await supabase.from('trainings').update({ ...patch, event_id: eventId }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/trening/${id}`);
  redirect(`/trening/${id}`);
}

/** Soft delete: the training goes to the trash and is purged after the retention period. */
export async function deleteTrainingForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('trainings').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  redirect('/');
}

/** Takes a training out of the trash. RLS decides who may. */
export async function restoreTrainingForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('trainings').update({ deleted_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/korpa');
  redirect('/korpa');
}

/** Deletes a trashed training for good, including its stored source files. */
export async function purgeTrainingForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const supabase = await createClient();
  const bucket = supabase.storage.from('source-files');
  await purgeTraining(
    {
      async isTrashed(tid) {
        const { data } = await supabase.from('trainings').select('id').eq('id', tid).not('deleted_at', 'is', null).maybeSingle();
        return data !== null;
      },
      async listFiles(tid) {
        const { data } = await bucket.list(tid, { limit: 1000 });
        return (data ?? []).map((f) => `${tid}/${f.name}`);
      },
      async removeFiles(paths) {
        const { error } = await bucket.remove(paths);
        if (error) throw new Error(error.message);
      },
      async deleteForever(tid) {
        const { error } = await supabase.rpc('delete_training_forever', { tid });
        if (error) throw new Error(error.message);
      },
    },
    id,
  );
  revalidatePath('/korpa');
  redirect('/korpa');
}

/** Confirms a proposed alignment from the report. RLS decides who may. */
export async function confirmAlignmentForm(form: FormData): Promise<void> {
  const matchId = String(form.get('match_id') ?? '');
  const trainingId = String(form.get('training_id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('matches').update({ align_state: 'confirmed' }).eq('id', matchId);
  if (error) throw new Error(error.message);
  revalidatePath(`/trening/${trainingId}`);
}
