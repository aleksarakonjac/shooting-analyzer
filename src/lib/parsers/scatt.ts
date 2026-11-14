import initSqlJs from 'sql.js';
import { decodeTraceBlob, qUncompress, type TraceSamples } from '@/lib/scatt/decode';

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
  /** When SCATT's match started (Unix epoch ms), if the session recorded it: shots before it are probes. */
  matchStartMs?: number;
  distanceM: number;
  caliberMm: number;
  shots: ScattShot[];
}

export interface ReadScattOptions {
  /** Browser builds must point at the served sql-wasm.wasm. Node resolves it itself. */
  locateFile?: (file: string) => string;
}

/**
 * The `timerStartMatch` of a session's property map (a Qt QVariantMap: UTF-16 key, then a qlonglong variant
 * as type 4, a null flag and 8 bytes). Undefined when the map lacks it or is not what we expect.
 */
export async function readMatchStart(properties: Uint8Array | undefined): Promise<number | undefined> {
  if (!properties) return undefined;
  try {
    const map = await qUncompress(properties);
    const key = new Uint8Array([...'timerStartMatch'].flatMap((c) => [0, c.charCodeAt(0)]));
    outer: for (let i = 0; i + key.length + 13 <= map.length; i++) {
      for (let k = 0; k < key.length; k++) if (map[i + k] !== key[k]) continue outer;
      const v = new DataView(map.buffer, map.byteOffset + i + key.length, 13);
      if (v.getUint32(0) !== 4) return undefined;
      const ms = Number(v.getBigInt64(5));
      return ms > 1e12 && ms < 1e14 ? ms : undefined;
    }
  } catch {
    /* an unreadable map just means no hint */
  }
  return undefined;
}

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
    const props = db.exec('SELECT properties FROM sessions WHERE timer = ? LIMIT 1', [meta[0]])[0]?.values[0]?.[0] as Uint8Array | undefined;
    const matchStartMs = await readMatchStart(props);
    return {
      sessionStartMs: meta[0],
      ...(matchStartMs !== undefined ? { matchStartMs } : {}),
      distanceM: meta[1],
      caliberMm: meta[2],
      shots: rows.map((r) => ({ id: r[0], tMs: r[1], flaggedMatch: r[2] !== 0 })),
    };
  } finally {
    db.close();
  }
}

/** Upper bound of decoded samples in one file (about 7 hours at 100 Hz). */
export const MAX_FILE_SAMPLES = 2_500_000;

export interface ScattTraceShot {
  shotId: number;
  traceId: number;
  /** Unix epoch ms. */
  timer: number;
  /** Sample index of the shot in its trace. */
  offset: number;
  match: boolean;
  missed: boolean;
  deleted: boolean;
}

export interface ScattTraceFile {
  sampleRate: number;
  /** Start of the file's session, Unix epoch ms; orders several files of one match. */
  sessionStartMs: number;
  traces: Map<number, TraceSamples & { timer: number; timerEnter: number }>;
  shots: ScattTraceShot[];
  /** The stored blob of a trace, for diagnostics and tests. */
  rawBlob: (traceId: number) => Uint8Array | undefined;
}

/** Every aim trace and shot of a SCATT file, decoded (see src/lib/scatt/decode.ts). */
export async function readScattTraces(data: Uint8Array, opts: ReadScattOptions = {}): Promise<ScattTraceFile> {
  const SQL = await initSqlJs(opts.locateFile ? { locateFile: opts.locateFile } : undefined);
  let db: InstanceType<typeof SQL.Database>;
  try {
    db = new SQL.Database(data);
  } catch {
    throw new NotScattFileError();
  }
  try {
    const first = db.exec('SELECT sample_rate, timer FROM sessions ORDER BY timer ASC LIMIT 1')[0]?.values[0];
    const rate = Number(first?.[0] ?? 0);
    if (!rate) throw new NotScattFileError('SCATT file contains no session');
    const traceRows = (db.exec('SELECT trace_id, timer, timer_enter, data FROM traces ORDER BY trace_id')[0]?.values ?? []) as [
      number,
      number,
      number,
      Uint8Array,
    ][];
    const shotRows = (db.exec(
      'SELECT shot_id, trace_id, timer, trace_offset, match_shot, missed, deleted FROM shots ORDER BY timer ASC',
    )[0]?.values ?? []) as number[][];
    const blobs = new Map(traceRows.map((r) => [r[0], r[3]]));
    const traces = new Map<number, TraceSamples & { timer: number; timerEnter: number }>();
    // A real session holds a few hundred thousand samples; far more means a crafted file.
    let total = 0;
    for (const [id, timer, timerEnter, blob] of traceRows) {
      const decoded = await decodeTraceBlob(blob);
      total += decoded.x.length;
      if (total > MAX_FILE_SAMPLES) throw new NotScattFileError('SCATT file has too many trace samples');
      traces.set(id, { ...decoded, timer, timerEnter });
    }
    return {
      sampleRate: rate,
      sessionStartMs: Number(first?.[1] ?? 0),
      traces,
      shots: shotRows.map((r) => ({
        shotId: r[0],
        traceId: r[1],
        timer: r[2],
        offset: r[3],
        match: r[4] !== 0,
        missed: r[5] !== 0,
        deleted: r[6] !== 0,
      })),
      rawBlob: (id) => blobs.get(id),
    };
  } finally {
    db.close();
  }
}
