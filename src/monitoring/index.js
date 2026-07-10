export class MonitoringViewModel {
  static from(snapshot, forecast) {
    const currentPoint = forecast.points[0];
    const activeFlight = snapshot.flights.find((flight) => flight.status === "landed") ?? snapshot.flights[0];

    return {
      asOf: snapshot.asOf,
      landingState: activeFlight?.status === "landed" ? "lit-after-landing" : "dark-before-landing",
      activeFlight,
      zones: snapshot.zones.map((zone) => {
        const forecastZone = currentPoint.zones.find((candidate) => candidate.zoneId === zone.zoneId);
        return {
          ...zone,
          queuePressure: forecastZone.queuePressure,
          status: forecastZone.status,
          staffCount: snapshot.staff.filter((staff) => staff.zoneId === zone.zoneId).length,
        };
      }),
      flows: snapshot.passengerFlows,
      staff: snapshot.staff,
    };
  }
}
