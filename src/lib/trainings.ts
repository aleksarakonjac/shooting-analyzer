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
