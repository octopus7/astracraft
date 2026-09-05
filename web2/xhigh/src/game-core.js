export const WORLD_BOUNDS = Object.freeze({ minX: -17, maxX: 17, minZ: -13, maxZ: 13 });

export const STATION_BLUEPRINTS = Object.freeze([
  { id: 'aster', nodeName: 'Station_Aster', label: 'ASTER / 북문', x: -9.25, z: -6.6 },
  { id: 'meridian', nodeName: 'Station_Meridian', label: 'MERIDIAN / 정비고', x: 8.7, z: -2.1 },
  { id: 'lumen', nodeName: 'Station_Lumen', label: 'LUMEN / 남측', x: 5.2, z: 8.3 },
]);

export function clampToWorld(position, bounds = WORLD_BOUNDS) {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, position.z)),
  };
}

export function moveToward(current, target, maxDistance) {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0 || distance <= maxDistance) return { x: target.x, z: target.z, arrived: true };
  const scale = maxDistance / distance;
  return { x: current.x + dx * scale, z: current.z + dz * scale, arrived: false };
}

export function findNearestStation(position, stations = STATION_BLUEPRINTS) {
  let nearest = null;
  for (const station of stations) {
    const distance = Math.hypot(station.x - position.x, station.z - position.z);
    if (!nearest || distance < nearest.distance) nearest = { ...station, distance };
  }
  return nearest;
}

export function advanceRepair(progress, deltaSeconds, isRepairing, durationSeconds = 1.35) {
  if (isRepairing) return Math.min(1, progress + deltaSeconds / durationSeconds);
  return Math.max(0, progress - deltaSeconds * 0.55);
}

export function formatDistrictTime(totalSeconds) {
  const day = 24 * 60 * 60;
  const wrapped = ((Math.floor(totalSeconds) % day) + day) % day;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
