import type { ClientToServerEvents, ServerToClientEvents } from '@chief/shared';
import type { Logger } from 'pino';
import type { Server, Socket } from 'socket.io';
import type { AlertsService } from './alerts.service.js';
import type { CrewService } from './crew.service.js';
import type { HealthService } from './health.service.js';
import type { InventoryService } from './inventory/inventory.service.js';
import type { MissionClock } from './mission-clock.js';
import type { MissionSimulator } from './simulator/live.js';

export type ChiefServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ChiefSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const room = (crewId: string) => `crew:${crewId}`;

/**
 * The live loop. On every tick the simulator advances the mission clock and writes the due
 * readings; then the rules engine re-evaluates each crew member and the changes go to the
 * clients over Socket.IO. Each client only receives the crew member it selected
 * ('crew:select'). The inventory books the day's use as the clock passes each day's end, and
 * every stock change goes to all clients ('inventory:updated'). The loop calls `simulator.tick()` itself so a failed tick is logged
 * instead of crashing the process.
 */
export class LiveService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly io: ChiefServer,
    private readonly clock: MissionClock,
    private readonly simulator: MissionSimulator | null,
    private readonly crew: CrewService,
    private readonly health: HealthService,
    private readonly alerts: AlertsService,
    private readonly inventory: InventoryService,
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {
    io.on('connection', (socket) => this.onConnection(socket));
    simulator?.on('measurement', (m) => {
      this.io.to(room(m.crewMemberId)).emit('measurement:new', m);
    });
    simulator?.on('clock', (clock) => this.io.emit('mission:clock', clock));
    inventory.on('changed', () => this.io.emit('inventory:updated', this.inventory.stocks()));
    simulator?.on('end', () => {
      this.logger.info('The mission reached its last day; live data stopped');
      this.stop();
    });
  }

  /** Raises the current alerts at once, then ticks (only with the simulator on). */
  start(): void {
    this.evaluateAll();
    this.inventory.catchUp();
    if (this.simulator) this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  /** One step of the loop. Errors are logged so one bad tick does not stop the loop. */
  tick(): void {
    try {
      const { inserted } = this.simulator?.tick() ?? { inserted: 0 };
      if (inserted > 0) this.evaluateAll();
      this.inventory.catchUp();
    } catch (error) {
      this.logger.error({ err: error }, 'Live tick failed');
    }
  }

  private evaluateAll(): void {
    for (const { id } of this.crew.list()) this.evaluate(id);
  }

  /** Re-evaluates a crew member and broadcasts the health score and alert changes. */
  private evaluate(crewId: string): void {
    const evaluation = this.health.evaluate(crewId);
    const target = this.io.to(room(crewId));
    target.emit('health:updated', evaluation.health);
    const { created, updated } = this.alerts.sync(crewId, evaluation);
    for (const alert of created) target.emit('alert:new', alert);
    for (const alert of updated) target.emit('alert:updated', alert);
  }

  private onConnection(socket: ChiefSocket): void {
    socket.emit('mission:clock', this.clock.snapshot());
    socket.on('crew:select', (crewId) => {
      if (typeof crewId !== 'string' || !this.crew.list().some((c) => c.id === crewId)) return;
      for (const joined of socket.rooms) {
        if (joined.startsWith('crew:')) void socket.leave(joined);
      }
      void socket.join(room(crewId));
      socket.emit('health:updated', this.health.evaluate(crewId).health);
    });
  }
}
