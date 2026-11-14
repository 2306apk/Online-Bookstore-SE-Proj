import { randomBytes } from 'node:crypto';

export const PAYMENT_SCENARIOS = Object.freeze(['SUCCESS', 'DECLINED', 'ERROR']);

export class PaymentFailure extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PaymentFailure';
    this.code = code;
  }
}

/**
 * THE GATEWAY CONTRACT (what a real sandbox/gateway must provide to replace this file):
 *   charge({ amount, currency, scenario })   -> { status: 'SUCCEEDED', reference } or throws PaymentFailure
 *   reverse({ reference, amount, currency, idempotencyKey }) -> { status: 'REVERSED' } or throws (void/refund of a captured charge)
 *     The idempotencyKey is stable for one refund, so calling reverse() again after a crash or timeout must NOT
 *     refund twice: the gateway must return the first result for the same key (real gateways support this).
 * The order service calls reverse() whenever money was captured but no order could be saved, and it
 * records the outcome. A real gateway that cannot reverse a charge must NOT be plugged in without
 * extra handling, because "charged but no order" would then be silent.
 *
 * Payment SIMULATION. There is no real gateway and no card data anywhere in this project.
 * The scenario lets testers (and the demo) choose the outcome. A real sandbox gateway
 * would replace this one function, so it is passed in as a dependency and can be mocked.
 */
export async function simulatePayment({ amount, currency, scenario = 'SUCCESS' }) {
  if (!(amount > 0)) throw new PaymentFailure('PAYMENT_INVALID_AMOUNT', 'The payment amount is invalid.');
  if (scenario === 'DECLINED') throw new PaymentFailure('PAYMENT_DECLINED', 'The simulated payment was declined.');
  if (scenario === 'ERROR') throw new PaymentFailure('PAYMENT_GATEWAY_ERROR', 'The simulated payment service is unavailable. Please try again.');
  return { status: 'SUCCEEDED', reference: `SIM-${randomBytes(6).toString('hex').toUpperCase()}`, currency };
}

const completedReversals = new Map();

export async function simulateReversal({ reference, idempotencyKey }) {
  if (idempotencyKey && completedReversals.has(idempotencyKey)) return completedReversals.get(idempotencyKey); // same key, same refund
  if (!reference) throw new PaymentFailure('PAYMENT_REVERSAL_FAILED', 'There is no payment to reverse.');
  const result = { status: 'REVERSED', reference };
  if (idempotencyKey) completedReversals.set(idempotencyKey, result);
  return result;
}
