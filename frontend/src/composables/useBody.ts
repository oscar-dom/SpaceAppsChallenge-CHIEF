import type { BodySystemId } from '@chief/shared';
import { type Region, REGION_SYSTEMS, SECTIONS } from '../lib/sections';
import { type UiStatus, worst } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useWorkspaceStore } from '../stores/workspace';

/** Body map data of a crew member, and what clicking a region opens. */
export function useBody() {
  const mission = useMissionStore();
  const ws = useWorkspaceStore();

  /** The system a region stands for: for the head, the worse of its two systems. */
  function regionSystem(crewId: string, region: Region): BodySystemId {
    const systems = REGION_SYSTEMS[region];
    const status = (s: BodySystemId) => mission.system(crewId, s).status;
    const target = worst(systems.map(status));
    return systems.find((s) => status(s) === target) ?? (systems[0] as BodySystemId);
  }

  function statuses(crewId: string): Record<Region, UiStatus> {
    return Object.fromEntries(
      (Object.keys(REGION_SYSTEMS) as Region[]).map((r) => [
        r,
        worst(REGION_SYSTEMS[r].map((s) => mission.system(crewId, s).status)),
      ]),
    ) as Record<Region, UiStatus>;
  }

  function info(crewId: string): Record<Region, { title: string; line: string }> {
    return Object.fromEntries(
      (Object.keys(REGION_SYSTEMS) as Region[]).map((r) => {
        const sys = regionSystem(crewId, r);
        const line = REGION_SYSTEMS[r].map((s) => mission.system(crewId, s).driver).join(' · ');
        return [r, { title: SECTIONS[sys].name, line }];
      }),
    ) as Record<Region, { title: string; line: string }>;
  }

  function pick(crewId: string, region: Region | 'body') {
    mission.selected = crewId;
    ws.open(region === 'body' ? 'overview' : regionSystem(crewId, region));
  }

  return { statuses, info, pick };
}
