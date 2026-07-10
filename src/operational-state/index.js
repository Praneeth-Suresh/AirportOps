import { assertOperationalSnapshot, cloneContract, deepFreeze } from "../contracts/index.js";
import { createFixtureSnapshot } from "../fixtures/deterministicAdapters.js";

export class OperationalStateReader {
  constructor(snapshotFactory = createFixtureSnapshot) {
    this.snapshotFactory = snapshotFactory;
  }

  getSnapshot() {
    const snapshot = cloneContract(this.snapshotFactory());
    assertOperationalSnapshot(snapshot);
    return deepFreeze(snapshot);
  }
}

export function createOperationalStateReader(snapshotFactory) {
  return new OperationalStateReader(snapshotFactory);
}
