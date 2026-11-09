'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Deletes a final; RLS decides who may. The training's report is refreshed. */
export async function deleteFinalForm(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const trainingId = String(form.get('training_id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('finals').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath(`/trening/${trainingId}`);
}
