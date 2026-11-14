// SRS OBS-F-014 says cancellation is allowed "within the configured cancellation window" but does not
// define the window. Until the team decides, there is NO time limit (null). Set
// ORDER_CANCELLATION_WINDOW_MINUTES to enforce one without changing code.
function readWindowMinutes(rawValue) {
  if (rawValue === undefined || rawValue === '') return null;
  const minutes = Number(rawValue);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('ORDER_CANCELLATION_WINDOW_MINUTES must be a positive number.');
  return minutes;
}

export const orderRules = Object.freeze({
  cancellationWindowMinutes: readWindowMinutes(process.env.ORDER_CANCELLATION_WINDOW_MINUTES),
});
