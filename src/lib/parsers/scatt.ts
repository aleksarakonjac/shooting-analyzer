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
    // Session of the earliest shot; with no shots, the earliest session. The sample holds one session.
    const meta =
      rows[0]?.slice(3, 6) ??
      (db.exec('SELECT timer, distance, caliber FROM sessions ORDER BY timer ASC LIMIT 1')[0]?.values[0] as
        | number[]
        | undefined);
    if (!meta) throw new NotScattFileError('SCATT file contains no session');
    return {
      sessionStartMs: meta[0],
      distanceM: meta[1],
      caliberMm: meta[2],
      shots: rows.map((r) => ({ id: r[0], tMs: r[1], flaggedMatch: r[2] !== 0 })),
    };
  } finally {
    db.close();
  }
}
