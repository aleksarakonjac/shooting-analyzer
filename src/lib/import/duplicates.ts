import { createClient } from '@/lib/supabase/client';

export interface PickedFile {
  fileName: string;
  sha: string;
}

export interface StoredSource {
  sha256: string;
  trainings: { id: string; name: string; trained_on: string; deleted_at: string | null } | null;
}

export interface ImportedMatch {
  fileName: string;
  trainingId: string;
  trainingName: string;
  trainedOn: string;
}

/** Picked files whose exact content is already stored with a live training (trash ignored), one hit per file. */
export function matchImported(picked: PickedFile[], stored: StoredSource[]): ImportedMatch[] {
  const out: ImportedMatch[] = [];
  for (const p of picked) {
    const hit = stored.find((s) => s.sha256 === p.sha && s.trainings && s.trainings.deleted_at === null);
    if (hit?.trainings) {
      out.push({ fileName: p.fileName, trainingId: hit.trainings.id, trainingName: hit.trainings.name, trainedOn: hit.trainings.trained_on });
    }
  }
  return out;
}

/** Earlier imports of these files for the same shooter (row-level security limits what is visible). */
export async function findImported(shooterId: string, picked: PickedFile[]): Promise<ImportedMatch[]> {
  if (picked.length === 0) return [];
  const { data } = await createClient()
    .from('source_files')
    .select('sha256, trainings!inner(id, name, trained_on, deleted_at, shooter_id)')
    .in('sha256', picked.map((p) => p.sha))
    .eq('trainings.shooter_id', shooterId);
  return matchImported(picked, (data ?? []) as unknown as StoredSource[]);
}
