import { recoverIncompleteCheckouts } from './order.service.js';

const FIVE_MINUTES = 5 * 60 * 1000;

// Runs once at start-up and then regularly, so an interrupted checkout never leaves stock stuck.
export function startCheckoutRecovery({ intervalMs = FIVE_MINUTES } = {}) {
  const run = () => recoverIncompleteCheckouts().catch((error) => console.error(`[RECOVERY] ${error.message}`));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
}
