'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { purgeTraining } from '@/lib/trash/purge';

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
