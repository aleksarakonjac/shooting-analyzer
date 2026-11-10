'use server';
import { requireOne, requireUuid } from '@/lib/actionGuard';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Deletes a final; RLS decides who may. The training's report is refreshed. */
export async function deleteFinalForm(form: FormData): Promise<void> {
  const id = requireUuid(form.get('id'));
  const trainingId = requireUuid(form.get('training_id'));
  const supabase = await createClient();
  requireOne(await supabase.from('finals').delete().eq('id', id).select('id'));
  revalidatePath(`/trening/${trainingId}`);
}
