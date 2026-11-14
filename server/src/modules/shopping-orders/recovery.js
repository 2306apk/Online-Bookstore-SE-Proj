import { recoverIncompleteCheckouts } from './order.service.js';

const FIVE_MINUTES = 5 * 60 * 1000;

// Runs once at start-up and then regularly, so an interrupted checkout never leaves stock stuck.
// Runs never overlap inside this process (a slow run makes the next tick wait). Between processes, the
// per-attempt lease in recoverIncompleteCheckouts() keeps two runs from handling the same attempt.
export function startCheckoutRecovery({ intervalMs = FIVE_MINUTES } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await recoverIncompleteCheckouts();
    } catch (error) {
      console.error(`[RECOVERY] ${error.message}`);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
}
