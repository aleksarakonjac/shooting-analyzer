import initSqlJs from 'sql.js';

export class NotScattFileError extends Error {
  constructor(message = 'Not a SCATT Expert file') {
    super(message);
    this.name = 'NotScattFileError';
  }
}

export interface ScattShot {
  id: number;
  /** Unix epoch milliseconds, UTC. */
  tMs: number;
  /** SCATT's own match flag (false = probe). Informs the proposal only. */
  flaggedMatch: boolean;
}

export interface ScattData {
  sessionStartMs: number;
  distanceM: number;
  caliberMm: number;
  shots: ScattShot[];
}

export interface ReadScattOptions {
  /** Browser builds must point at the served sql-wasm.wasm. Node resolves it itself. */
  locateFile?: (file: string) => string;
}

// Phase 4 will add `traceBlobs`; traces are intentionally not read here.
export async function readScatt(data: Uint8Array, opts: ReadScattOptions = {}): Promise<ScattData> {
  const SQL = await initSqlJs(opts.locateFile ? { locateFile: opts.locateFile } : undefined);
  let db: InstanceType<typeof SQL.Database>;
  try {
    db = new SQL.Database(data);
  } catch {
    throw new NotScattFileError();
  }
  try {
    let shotRows;
    try {
      shotRows = db.exec(
        `SELECT s.shot_id, s.timer, s.match_shot, se.timer, se.distance, se.caliber
           FROM shots s
           JOIN traces t ON t.trace_id = s.trace_id
           JOIN sessions se ON se.session_id = t.session_id
          WHERE s.deleted = 0
          ORDER BY s.timer ASC`,
      );
    } catch {
      throw new NotScattFileError();
    }
    const rows = (shotRows[0]?.values ?? []) as number[][];
    if (rows.length === 0) throw new NotScattFileError('SCATT file contains no shots');
    const first = rows[0];
    return {
      // Session of the earliest shot; the sample holds a single session.
      sessionStartMs: first[3],
      distanceM: first[4],
      caliberMm: first[5],
      shots: rows.map((r) => ({ id: r[0], tMs: r[1], flaggedMatch: r[2] === 1 })),
    };
  } finally {
    db.close();
  }
}
