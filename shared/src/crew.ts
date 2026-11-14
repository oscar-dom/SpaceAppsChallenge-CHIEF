/** A fictional crew member of the simulated ISS mission. */
export interface CrewMember {
  id: string;
  name: string;
  /** e.g. "Commander", "Flight Engineer". */
  role: string;
  agency: string;
  age: number;
  sex: 'female' | 'male';
  /** Optional picture for the crew switcher. */
  avatarUrl?: string;
}

/** State of the simulated mission clock. */
export interface MissionClock {
  /** 1-based day of the mission. */
  missionDay: number;
  /** Planned mission length in days (about 180 for a 6-month ISS increment). */
  missionLengthDays: number;
  /** Current simulated time, ISO 8601. */
  missionTime: string;
  /** Simulated seconds per real second. */
  timeScale: number;
}
