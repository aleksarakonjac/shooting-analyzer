'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Edits the free-text fields of a training. RLS decides who may. */
export async function updateTrainingForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase
    .from('trainings')
    .update({
      name: String(form.get('name') ?? '').trim(),
      place: String(form.get('place') ?? '').trim(),
      notes: String(form.get('notes') ?? '').trim(),
    })
    .eq('id', id);
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
  // Storage first: its policy needs the training row, which the next call removes.
  const bucket = supabase.storage.from('source-files');
  const { data: files } = await bucket.list(id);
  if (files?.length) await bucket.remove(files.map((f) => `${id}/${f.name}`));
  const { error } = await supabase.rpc('delete_training_forever', { tid: id });
  if (error) throw new Error(error.message);
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
