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
