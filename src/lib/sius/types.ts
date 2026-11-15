/** Raw SIUS Shooting Sports Cloud shapes (docs/research/sius-cloud-api.md). Only the fields ZeroIn reads. */

export interface SiusShot {
  shotNumber?: number;
  /** "x/y" in mm from the centre, +x right, +y up. */
  coordinates?: string | null;
  /** UTC, ms precision. */
  timeStamp?: string | null;
  score?: string | null;
  /** e.g. ["10x", "10.6"] on 50 m (whole with inner mark, decimal), ["10.1"] on 10 m. */
  scores?: string[] | null;
  innerTen?: boolean;
  miss?: boolean;
}

export interface SiusShotGroup {
  shots: SiusShot[];
}

export interface SiusStageResult {
  stageName: string;
  sightingShots?: SiusShotGroup[] | null;
  competitionGroups?: SiusShotGroup[] | null;
}

export interface SiusShotsResponse {
  type: 'SingleStage' | 'MultiStage' | string;
  sightingShots?: SiusShotGroup[] | null;
  competitionGroups?: SiusShotGroup[] | null;
  stageResults?: SiusStageResult[] | null;
}

/** One row of the Training Center exercise list. */
export interface SiusExercise {
  exerciseId: string;
  exerciseName: string;
  exerciseDate: string;
  startTime?: string | null;
  lane?: number | string | null;
  /** "630.9" or "590-38x". */
  totalString?: string | null;
  numberOfCompetitionShots: number;
  isTargetViewSupported?: boolean;
  comment?: string | null;
}

/** A public competition from the Result Service. */
export interface SiusCompetition {
  id: string;
  name: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  timeZone: string;
}

export interface SiusEvent {
  id: string;
  name: string;
}

/** A part (sub-event) of an event: Qualification, Final, ... */
export interface SiusPart {
  id: string;
  name: string;
  /** ISO with the venue offset, e.g. 2026-11-03T09:15:00+03:00. */
  startDate: string;
}

/** One athlete in a part's ranking. */
export interface RankingRow {
  athleteRunningId: string;
  identifier: string;
  displayName: string;
  nation: string;
  rank: string;
  total: string;
  seriesTotals: string[];
}
