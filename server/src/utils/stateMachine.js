import { ApiError } from './errors.js';

/**
 * The complete legal asset lifecycle. The spec only gives examples;
 * this map is the single source of truth — every status change in the
 * system goes through assertTransition().
 */
export const ASSET_TRANSITIONS = {
  AVAILABLE: ['ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST'],
  RESERVED: ['ALLOCATED', 'AVAILABLE'],
  ALLOCATED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'LOST'],
  UNDER_MAINTENANCE: ['AVAILABLE', 'ALLOCATED', 'RETIRED'],
  LOST: ['AVAILABLE'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
};

export function assertTransition(from, to) {
  const allowed = ASSET_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(
      'ILLEGAL_STATE_TRANSITION',
      `An asset cannot go from ${pretty(from)} to ${pretty(to)}.`,
      { from, to, allowed }
    );
  }
}

export const pretty = (s) =>
  s.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
