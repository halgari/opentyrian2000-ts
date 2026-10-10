// SPDX-License-Identifier: GPL-2.0-or-later
// Not part of the C: a secret mini-mode the script reaches that is not ported yet (sub-project 5).

/**
 * Thrown by a script command whose mode is not ported but is reachable by an ordinary menu choice (`]e`, `]g`).
 * `gameLoop` shows a notice and returns to the title instead of ending the session. The message starts with `unported:`.
 */
export class UnavailableModeError extends Error {
  constructor(what: string) {
    super(`unported: ${what}`);
    this.name = 'UnavailableModeError';
  }
}
