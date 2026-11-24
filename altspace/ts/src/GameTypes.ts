// Translated from the upstream Assets/Scripts/GameTypes.cs. Enum values keep the upstream numbers; every name is the
// port's own (PORT.md, "Terms"): the crew role is the Technician, the hidden role the Saboteur, a late joiner an
// Observer; a meeting is a Muster; a sabotage is a Fault, its repair a Reset; a task is a Job.

/** PlayerRole */
export const Role = { Unassigned: 0, Technician: 1, Saboteur: 2, Observer: 3 } as const;
export type Role = (typeof Role)[keyof typeof Role];

/** MatchState */
export const MatchState = { Lobby: 0, Playing: 1, Muster: 2, Ended: 3 } as const;
export type MatchState = (typeof MatchState)[keyof typeof MatchState];

/** WinningTeam */
export const Team = { None: 0, Technicians: 1, Saboteurs: 2 } as const;
export type Team = (typeof Team)[keyof typeof Team];

/** SabotageType. Same numbers as upstream: 1 the vision fault, 2 the countdown fault, 3 the job blocker, 4 the fourth. */
export const Fault = { None: 0, Blackout: 1, Breach: 2, Jam: 3, Scrubber: 4 } as const;
export type Fault = (typeof Fault)[keyof typeof Fault];

/** InteractionKind */
export const Interaction = { None: 0, Job: 1, Reset: 2 } as const;
export type Interaction = (typeof Interaction)[keyof typeof Interaction];

/** TaskKind: hold for 1.35 s, tap four times, release inside a band. */
export const JobKind = { Hold: 0, Tap: 1, Timing: 2 } as const;
export type JobKind = (typeof JobKind)[keyof typeof JobKind];

/** AnnouncementType */
export const Announcement = { None: 0, MusterResult: 1, MatchResult: 2 } as const;
export type Announcement = (typeof Announcement)[keyof typeof Announcement];

/** The six logical buttons of the upstream input (Player.KillButton ... VentButton), same indices. */
export const Btn = { Eliminate: 0, Alarm: 1, Vote: 2, Use: 3, Fault: 4, Hatch: 5 } as const;
export type Btn = (typeof Btn)[keyof typeof Btn];

/** Player.SkipVoteTarget */
export const ABSTAIN = -1;

export const ROLE_NAMES: Record<number, string> = { 0: "Unassigned", 1: "Technician", 2: "Saboteur", 3: "Observer" };
export const TEAM_NAMES: Record<number, string> = { 0: "Nobody", 1: "The technicians", 2: "The saboteurs" };
export const FAULT_NAMES: Record<number, string> = { 0: "", 1: "Blackout", 2: "Ballast breach", 3: "Sonar jam", 4: "Scrubber fault" };
export const FAULT_IDS: Record<string, Fault> = { blackout: Fault.Blackout, breach: Fault.Breach, jam: Fault.Jam, scrubber: Fault.Scrubber };
export const JOB_KIND_IDS: Record<string, JobKind> = { hold: JobKind.Hold, tap: JobKind.Tap, timing: JobKind.Timing };
export const JOB_KIND_NAMES: Record<number, string> = { 0: "Hold", 1: "Tap", 2: "Timing" };

/** The rules' numbers. Defaults are the upstream scene's serialized values (PORT.md section 2 and 8.2). */
export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  saboteurs: number;
  /** Bots the referee adds at the start, up to the free slots (0 by default). */
  bots: number;
  startBy: "anyone" | "admin";
  jobsPerPlayer: number;
  jobWaves: number;
  firstWaveSeconds: number;
  waveIntervalSeconds: number;
  shiftSeconds: number;
  shiftFailSeconds: number;
  eliminateCooldown: number;
  eliminateRange: number;
  reportRange: number;
  jobRange: number;
  holdSeconds: number;
  tapCount: number;
  timingCycleSeconds: number;
  timingBand: [number, number];
  faultRange: number;
  faultCooldown: number;
  /** The fixed delay before the first fault (Spawner:1265). */
  firstFaultSeconds: number;
  breachSeconds: number;
  /** The fourth fault's countdown: 0 makes it do nothing, as upstream (PORT.md D2). */
  scrubberSeconds: number;
  resetSeconds: number;
  hatchRange: number;
  musterRange: number;
  musterCooldown: number;
  musterSeconds: number;
  announceSeconds: number;
  returnAfterMuster: boolean;
  visionRange: number;
  blackoutVision: number;
  rangeSlack: number;
  /** Bot numbers (Spawner:65-67, 69, 87-88). */
  botMoveSpeed: number;
  botVoteDelay: number;
  botVoteInterval: number;
  botTaskPause: number;
  botThinkSeconds: number;
  botFaultChance: number;
}

export const DEFAULT_SETTINGS: Settings = {
  minPlayers: 4,
  maxPlayers: 10,
  saboteurs: 1,
  bots: 0,
  startBy: "anyone",
  jobsPerPlayer: 5,
  jobWaves: 2,
  firstWaveSeconds: 30,
  waveIntervalSeconds: 45,
  shiftSeconds: 180,
  shiftFailSeconds: 4,
  eliminateCooldown: 10,
  eliminateRange: 1.45,
  reportRange: 1.7,
  jobRange: 1.1,
  holdSeconds: 1.35,
  tapCount: 4,
  timingCycleSeconds: 2.2,
  timingBand: [0.7, 0.82],
  faultRange: 1.2,
  faultCooldown: 18,
  firstFaultSeconds: 4,
  breachSeconds: 45,
  scrubberSeconds: 45,
  resetSeconds: 2,
  hatchRange: 0.9,
  musterRange: 1.15,
  musterCooldown: 25,
  musterSeconds: 30,
  announceSeconds: 4.5,
  returnAfterMuster: true,
  visionRange: 0,
  blackoutVision: 4.8,
  rangeSlack: 0.5,
  botMoveSpeed: 1.6,
  botVoteDelay: 1.5,
  botVoteInterval: 0.45,
  botTaskPause: 3.5,
  botThinkSeconds: 0.9,
  botFaultChance: 0.3,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Reads the snippet's attributes: every value has a fallback and a range, as PORT.md 8.2 lists them. */
export function readSettings(attributes: ReadonlyMap<string, string>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, timingBand: [...DEFAULT_SETTINGS.timingBand] as [number, number] };
  const num = (name: string, fallback: number, lo: number, hi: number): number => {
    const raw = attributes.get(name);
    if (raw === undefined || raw.trim() === "") return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
  };
  const int = (name: string, fallback: number, lo: number, hi: number) => Math.round(num(name, fallback, lo, hi));
  s.minPlayers = int("min-players", s.minPlayers, 2, 10);
  s.maxPlayers = int("max-players", s.maxPlayers, 2, 10);
  if (s.maxPlayers < s.minPlayers) s.maxPlayers = s.minPlayers;
  s.saboteurs = int("saboteurs", s.saboteurs, 1, 3);
  s.bots = int("bots", s.bots, 0, 9);
  s.startBy = attributes.get("start-by") === "admin" ? "admin" : "anyone";
  s.jobsPerPlayer = int("jobs-per-player", s.jobsPerPlayer, 1, 10);
  s.jobWaves = int("job-waves", s.jobWaves, 0, 5);
  s.firstWaveSeconds = num("first-wave-seconds", s.firstWaveSeconds, 1, 600);
  s.waveIntervalSeconds = num("wave-interval-seconds", s.waveIntervalSeconds, 1, 600);
  s.shiftSeconds = num("shift-seconds", s.shiftSeconds, 30, 3600);
  s.shiftFailSeconds = num("shift-fail-seconds", s.shiftFailSeconds, 1, 30);
  s.eliminateCooldown = num("eliminate-cooldown", s.eliminateCooldown, 0, 120);
  s.eliminateRange = num("eliminate-range", s.eliminateRange, 0.5, 5);
  s.reportRange = num("report-range", s.reportRange, 0.5, 5);
  s.jobRange = num("job-range", s.jobRange, 0.5, 5);
  s.holdSeconds = num("hold-seconds", s.holdSeconds, 0.1, 30);
  s.tapCount = int("pulse-count", s.tapCount, 1, 20);
  s.timingCycleSeconds = num("timing-cycle-seconds", s.timingCycleSeconds, 0.5, 30);
  const band = (attributes.get("timing-band") ?? "").trim().split(/\s+/).map(Number);
  if (band.length === 2 && band.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && band[0]! < band[1]!) s.timingBand = [band[0]!, band[1]!];
  s.faultRange = num("fault-range", s.faultRange, 0.5, 5);
  s.faultCooldown = num("fault-cooldown", s.faultCooldown, 0, 600);
  s.breachSeconds = num("surge-seconds", num("breach-seconds", s.breachSeconds, 5, 600), 5, 600);
  s.scrubberSeconds = num("scrubber-seconds", s.scrubberSeconds, 0, 600);
  s.resetSeconds = num("reset-seconds", s.resetSeconds, 0.1, 30);
  s.hatchRange = num("hatch-range", s.hatchRange, 0.3, 5);
  s.musterRange = num("muster-range", s.musterRange, 0.5, 5);
  s.musterCooldown = num("muster-cooldown", s.musterCooldown, 0, 600);
  s.musterSeconds = num("muster-seconds", s.musterSeconds, 5, 600);
  s.announceSeconds = num("announce-seconds", s.announceSeconds, 1, 60);
  s.returnAfterMuster = attributes.get("return-after-muster") !== "false";
  s.visionRange = num("vision-range", s.visionRange, 0, 100);
  s.blackoutVision = num("blackout-vision", s.blackoutVision, 1, 100);
  s.rangeSlack = num("range-slack", s.rangeSlack, 0, 3);
  return s;
}
