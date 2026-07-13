// migrateProgressBackup (backend B14): reuses the SAME migrate() discipline as
// store/indexedDbStore.ts's migrateV1ToV2, applied to a RESTORED snapshot whose schemaVersion is
// older than the running build's Store.schemaVersion. Today (schemaVersion 2 is the only shape
// that has ever shipped) this is a no-op forward-add, exactly like the greenfield IndexedDB
// migration: it EXISTS and is unit-tested now so the first in-anger snapshot migration (a future
// v2 -> v3 backup) is not this code path's first run.
import { CURRENT_SCHEMA_VERSION } from "../store/schema.js";
import type { ProgressBackup } from "../../contracts.js";

export function migrateProgressBackup(backup: ProgressBackup): ProgressBackup {
  let migrated = backup;
  if (migrated.schemaVersion < 2) {
    // v1 -> v2: no shape existed at v1 for completedNodes/reviews/settings/profile in a
    // ProgressBackup (progress backup itself is a v0.4/schemaVersion-2 feature), so there is
    // nothing to convert; this branch exists for symmetry with the Store's migrate() hook and to
    // give a future v2 -> v3 forward-add a proven place to land.
    migrated = { ...migrated, schemaVersion: 2 };
  }
  if (migrated.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `migrateProgressBackup: no migration path from schemaVersion ${migrated.schemaVersion} to ` +
        `${CURRENT_SCHEMA_VERSION}. This is a real gap to fold into a future backend-spec revision, ` +
        `not something to guess at silently.`,
    );
  }
  return migrated;
}
