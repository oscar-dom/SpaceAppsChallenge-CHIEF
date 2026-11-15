// Entry point: opens the database, wires the services and starts HTTP, Socket.IO and the
// live loop (mission clock + simulator + rules engine).
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createDatabase, DB_PATH, type DatabaseHandle } from './db/client.js';
import { runMigrations } from './db/migrations.js';
import { createServices, type Services } from './services/index.js';
import { LiveService, type ChiefServer } from './services/live.service.js';
import { MissionSimulator } from './services/simulator/live.js';

const env = loadEnv();
const logger = createLogger(env);

let database: DatabaseHandle;
let services: Services;
try {
  database = createDatabase();
  runMigrations(database.db);
  services = createServices(database.db, env, logger);
} catch (error) {
  logger.fatal(`Cannot start with ${DB_PATH}: ${(error as Error).message}`);
  process.exit(1);
}

const app = createApp({ services, logger, corsOrigin: env.CORS_ORIGIN });
const httpServer = createServer(app);
const io: ChiefServer = new Server(httpServer, { cors: { origin: env.CORS_ORIGIN } });

const simulator = env.SIMULATOR_ENABLED
  ? new MissionSimulator(database.db, { timeScale: env.TIME_SCALE })
  : null;
const live = new LiveService(
  io,
  services.clock,
  simulator,
  services.crew,
  services.health,
  services.alerts,
  services.inventory,
  env.TICK_INTERVAL_MS,
  logger,
);

httpServer.listen(env.PORT, () => {
  const clock = services.clock.snapshot();
  logger.info(
    `Backend on http://localhost:${env.PORT} (mission day ${clock.missionDay}, ` +
      `x${clock.timeScale}, simulator ${simulator ? 'on' : 'off'})`,
  );
  live.start();
});

/** Stop the loop (the simulator already stored the mission time), close sockets and the database so better-sqlite3 flushes the WAL. */
function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down`);
  live.stop();
  void io.close();
  httpServer.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
