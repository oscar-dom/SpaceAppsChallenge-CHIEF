import { createDatabase } from '../../db/client.js';
import { runMigrations } from '../../db/migrations.js';
import { MissionSimulator } from './live.js';

/**
 * `npm run simulate -w backend [-- --speed=600 --tick=1000 --scenario=solar-storm]`
 *
 * Runs the live simulator on its own (without the API) and logs what it writes. Useful to check the
 * data before the backend wires the events to Socket.IO. Stop it with Ctrl+C.
 */
function option(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const { db, close } = createDatabase();
runMigrations(db);

const speed = option('speed');
const simulator = new MissionSimulator(db, {
  timeScale: speed ? Number(speed) : undefined,
  tickMs: Number(option('tick') ?? 1000),
});

simulator.on('clock', (clock) => {
  const time = clock.missionTime.slice(11, 16);
  console.log(`Mission day ${clock.missionDay} ${time} UTC`);
});
simulator.on('scenario', (code) => console.log(`Scenario launched: ${code}`));
simulator.on('end', () => {
  console.log('The mission reached its last day.');
  close();
});

let readings = 0;
simulator.on('measurement', (m) => {
  readings++;
  if (readings <= 20 || readings % 100 === 0) {
    console.log(`  ${m.takenAt} ${m.crewMemberId} ${m.metricId} = ${m.value}`);
  }
});

const scenario = option('scenario');
if (scenario) simulator.triggerScenario(scenario);
simulator.start();

process.on('SIGINT', () => {
  simulator.stop();
  close();
  console.log(`\nStopped after ${readings} readings.`);
  process.exit(0);
});
