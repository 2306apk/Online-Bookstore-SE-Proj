import { Book } from '../book-catalogue/models/Book.js';
import { PaymentAttempt } from './models/PaymentAttempt.js';

/*
 * STOCK RESERVATION LEDGER
 *
 * MongoDB (standalone, no transactions) can only make ONE document change atomically. So the stock
 * number and the record of who is holding it live in the same document: Book.stock and
 * Book.reservations[{ attempt, quantity }]. Every operation below is a single updateOne:
 *
 *   reserve : stock -= q  AND  push { attempt, quantity }     (only if stock >= q and not already held)
 *   release : stock += q  AND  pull { attempt }               (only if that entry still exists)
 *   commit  : pull { attempt }                                (order confirmed, stock stays taken)
 *
 * Each one either happens completely or not at all, and each is a no-op when repeated, so a crash
 * can never leave stock wrong. The worst a crash can do is leave an entry for an attempt that has
 * already finished; reconcileReservations() finds those and applies the same idempotent call.
 */

export async function reserveLines(attemptId, lines) {
  for (const line of lines) {
    const result = await Book.updateOne(
      { _id: line.book, active: true, stock: { $gte: line.quantity }, 'reservations.attempt': { $ne: attemptId } },
      { $inc: { stock: -line.quantity }, $push: { reservations: { attempt: attemptId, quantity: line.quantity } } },
    );
    if (result.matchedCount === 1) continue;
    // Not matched: either there is not enough stock, or this attempt already holds the line (a repeated call).
    if (await Book.exists({ _id: line.book, 'reservations.attempt': attemptId })) continue;
    await releaseLines(attemptId, lines); // put back whatever was taken for the earlier lines
    return false;
  }
  return true;
}

export async function releaseLines(attemptId, lines) {
  for (const line of lines) {
    await Book.updateOne(
      { _id: line.book, reservations: { $elemMatch: { attempt: attemptId, quantity: line.quantity } } },
      { $inc: { stock: line.quantity }, $pull: { reservations: { attempt: attemptId } } },
    );
  }
}

export async function commitLines(attemptId, lines) {
  for (const line of lines) {
    await Book.updateOne({ _id: line.book, 'reservations.attempt': attemptId }, { $pull: { reservations: { attempt: attemptId } } });
  }
}

/**
 * Finds reservations whose checkout has already finished and settles them:
 *   attempt SUCCEEDED          -> commit (the order exists, the stock stays taken)
 *   attempt FAILED or missing  -> release (stock goes back)
 *   attempt STARTED/RESERVED   -> left alone (a live checkout, or recovery will claim it when its lease expires)
 * Safe to run repeatedly and from several processes at once.
 */
export async function reconcileReservations() {
  const settled = { committed: 0, released: 0 };
  const books = await Book.find({ 'reservations.attempt': { $exists: true } }).select('+reservations').lean();
  const attemptIds = [...new Set(books.flatMap((book) => book.reservations.map((entry) => String(entry.attempt))))];
  if (attemptIds.length === 0) return settled;
  const attempts = await PaymentAttempt.find({ _id: { $in: attemptIds } }).select('status').lean();
  const statusOf = new Map(attempts.map((attempt) => [String(attempt._id), attempt.status]));

  for (const book of books) {
    for (const entry of book.reservations) {
      const status = statusOf.get(String(entry.attempt));
      if (status === 'SUCCEEDED') {
        await commitLines(entry.attempt, [{ book: book._id }]);
        settled.committed += 1;
      } else if (status === 'FAILED' || status === undefined) {
        await releaseLines(entry.attempt, [{ book: book._id, quantity: entry.quantity }]);
        settled.released += 1;
      }
    }
  }
  return settled;
}
