import { assertOperationalSnapshot, cloneContract, deepFreeze } from "../contracts/index.js";
import { createFixtureSnapshot } from "../fixtures/deterministicAdapters.js";

export class OperationalDatabaseReader {
  constructor(rowSource = createFixtureOperationalDatabaseRows) {
    this.rowSource = rowSource;
  }

  getSnapshot(snapshotId) {
    const rows = cloneContract(this.rowSource(snapshotId));
    const snapshot = assembleOperationalSnapshot(rows, snapshotId);
    assertOperationalSnapshot(snapshot);
    validateDatabaseReferences(snapshot);
    return deepFreeze(snapshot);
  }
}

export function createOperationalDatabaseReader(rowSource) {
  return new OperationalDatabaseReader(rowSource);
}

export function assembleOperationalSnapshot(rows, requestedSnapshotId) {
  const snapshotRow = selectSnapshotRow(rows.operationalSnapshots, requestedSnapshotId);
  const airport = rows.airports.find((candidate) => candidate.airportId === snapshotRow.airportId);
  if (!airport) {
    throw new Error(`OperationalDatabase missing airport for snapshot: ${snapshotRow.airportId}`);
  }

  const zones = rows.zones
    .filter((zone) => zone.airportId === airport.airportId)
    .map((zone) => {
      const state = rows.zoneStates.find(
        (candidate) => candidate.snapshotId === snapshotRow.snapshotId && candidate.zoneId === zone.zoneId,
      );
      if (!state) {
        throw new Error(`OperationalDatabase missing zone state: ${zone.zoneId}`);
      }

      return {
        zoneId: zone.zoneId,
        label: zone.label,
        type: zone.type,
        occupancy: state.occupancy,
        capacity: zone.capacity,
        serviceRatePerMinute: zone.serviceRatePerMinute,
        confidence: state.confidence,
        freshness: state.freshness,
      };
    });

  return {
    asOf: snapshotRow.asOf,
    airport: {
      airportId: airport.airportId,
      name: airport.name,
      mapVersion: airport.mapVersion,
      paths: rows.zonePaths
        .filter((path) => path.airportId === airport.airportId)
        .map((path) => [path.fromZoneId, path.toZoneId]),
      transferRules: (rows.zoneRoleTransferRules ?? [])
        .filter((rule) => rule.airportId === airport.airportId)
        .map(({ airportId: _airportId, ...rule }) => rule),
    },
    zones,
    counters: rows.counterStates
      .filter((counter) => counter.snapshotId === snapshotRow.snapshotId)
      .map(({ snapshotId: _snapshotId, ...counter }) => counter),
    staff: rows.staffStates
      .filter((staff) => staff.snapshotId === snapshotRow.snapshotId)
      .map(({ snapshotId: _snapshotId, ...staff }) => staff),
    flights: rows.flightStates
      .filter((flight) => flight.snapshotId === snapshotRow.snapshotId)
      .map(({ snapshotId: _snapshotId, ...flight }) => flight),
    passengerFlows: rows.passengerFlows
      .filter((flow) => flow.snapshotId === snapshotRow.snapshotId)
      .map(({ snapshotId: _snapshotId, ...flow }) => flow),
    observations: rows.observations
      .filter((observation) => observation.snapshotId === snapshotRow.snapshotId)
      .map(({ snapshotId: _snapshotId, ...observation }) => observation),
  };
}

export function createFixtureOperationalDatabaseRows(snapshotId = "fixture-peak") {
  const snapshot = createFixtureSnapshot(1);
  const resolvedSnapshotId = snapshotId === "fixture-peak"
    ? "fixture-peak-2026-07-11T09:20:00+07:00"
    : snapshotId;

  return {
    airports: [
      {
        airportId: snapshot.airport.airportId,
        name: snapshot.airport.name,
        mapVersion: snapshot.airport.mapVersion,
      },
    ],
    zones: snapshot.zones.map((zone) => ({
      zoneId: zone.zoneId,
      airportId: snapshot.airport.airportId,
      label: zone.label,
      type: zone.type,
      capacity: zone.capacity,
      serviceRatePerMinute: zone.serviceRatePerMinute,
    })),
    zonePaths: snapshot.airport.paths.map(([fromZoneId, toZoneId]) => ({
      airportId: snapshot.airport.airportId,
      fromZoneId,
      toZoneId,
    })),
    zoneRoleTransferRules: snapshot.airport.transferRules.map((rule) => ({
      airportId: snapshot.airport.airportId,
      ...rule,
    })),
    operationalSnapshots: [
      {
        snapshotId: resolvedSnapshotId,
        airportId: snapshot.airport.airportId,
        asOf: snapshot.asOf,
        contractVersion: "v1",
      },
    ],
    zoneStates: snapshot.zones.map((zone) => ({
      snapshotId: resolvedSnapshotId,
      zoneId: zone.zoneId,
      occupancy: zone.occupancy,
      confidence: zone.confidence,
      freshness: zone.freshness,
    })),
    counterStates: snapshot.counters.map((counter) => ({ snapshotId: resolvedSnapshotId, ...counter })),
    staffStates: snapshot.staff.map((staff) => ({ snapshotId: resolvedSnapshotId, ...staff })),
    flightStates: snapshot.flights.map((flight) => ({ snapshotId: resolvedSnapshotId, ...flight })),
    passengerFlows: snapshot.passengerFlows.map((flow) => ({ snapshotId: resolvedSnapshotId, ...flow })),
    observations: snapshot.observations.map((observation) => ({ snapshotId: resolvedSnapshotId, ...observation })),
  };
}

function selectSnapshotRow(snapshotRows, requestedSnapshotId) {
  if (!snapshotRows.length) {
    throw new Error("OperationalDatabase has no operational snapshots");
  }
  if (!requestedSnapshotId) {
    return snapshotRows[0];
  }

  const snapshot = snapshotRows.find((candidate) => candidate.snapshotId === requestedSnapshotId);
  if (!snapshot) {
    throw new Error(`OperationalDatabase missing snapshot: ${requestedSnapshotId}`);
  }
  return snapshot;
}

function validateDatabaseReferences(snapshot) {
  const zoneIds = new Set(snapshot.zones.map((zone) => zone.zoneId));
  for (const counter of snapshot.counters) {
    assertKnownZone(zoneIds, counter.zoneId, `CounterState ${counter.counterId}`);
  }
  for (const staff of snapshot.staff) {
    assertKnownZone(zoneIds, staff.zoneId, `StaffState ${staff.staffId}`);
  }
  for (const flight of snapshot.flights) {
    assertKnownZone(zoneIds, flight.gateZoneId, `FlightState ${flight.flightId}`);
  }
}

function assertKnownZone(zoneIds, zoneId, label) {
  if (!zoneIds.has(zoneId)) {
    throw new Error(`${label} references unknown zone: ${zoneId}`);
  }
}

export const operationalDatabaseReader = new OperationalDatabaseReader();
