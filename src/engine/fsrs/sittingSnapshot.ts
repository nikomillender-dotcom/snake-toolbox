// SittingSnapshot (backend B13, D7 PINNED). "A sitting = one app open, up to the next app open or
// the next day, whichever comes first." Pure, testable, in-memory bookkeeping: no I/O.
//
// Instance lifetime IS the sitting boundary for the "next app open" half (the composition root
// constructs one ReviewScheduler per app load, so a fresh instance naturally starts with an empty
// graded-this-sitting set). The "or the next day" half needs an explicit day-rollover check
// because a long-lived tab can cross midnight without a fresh app load, so every observation
// compares the current call's calendar day (UTC) against the day the sitting began and resets the
// set on a mismatch.
export class SittingSnapshot {
  private sittingDay: string | null = null;
  private gradedThisSitting = new Set<string>();

  private dayKey(now: number): string {
    const iso = new Date(now).toISOString();
    return iso.slice(0, 10); // "YYYY-MM-DD", UTC calendar day
  }

  private rollIfNewDay(now: number): void {
    const day = this.dayKey(now);
    if (this.sittingDay === null) {
      this.sittingDay = day;
      return;
    }
    if (day !== this.sittingDay) {
      this.sittingDay = day;
      this.gradedThisSitting = new Set();
    }
  }

  /** Marks an item as graded THIS sitting; it will be excluded from this sitting's hand even if
   * FSRS rescheduled it to `due <= now` (D7's core rule). */
  markGraded(itemId: string, now: number): void {
    this.rollIfNewDay(now);
    this.gradedThisSitting.add(itemId);
  }

  /** True if the item was already graded this sitting and must be filtered out of the current
   * hand (getDueReviews / dueCount), even if it is technically due again. */
  isExcludedThisSitting(itemId: string, now: number): boolean {
    this.rollIfNewDay(now);
    return this.gradedThisSitting.has(itemId);
  }
}
