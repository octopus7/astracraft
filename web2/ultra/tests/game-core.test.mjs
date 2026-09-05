import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRICT_CONFIG,
  HAZARDS,
  REPAIR_NODES,
  SUPPLY_CACHES,
  WAVE_SCHEDULE,
  createGameState,
  distance2D,
  formatTime,
  getObjective,
  nearestRepairNode,
  startShift,
  tickGame,
  triggerScan
} from '../src/game-core.js';

function activeState() {
  const state = createGameState();
  startShift(state);
  return state;
}

function eventOf(result, type) {
  return result.events.find((event) => event.type === type);
}

test('fresh state exposes an explicit JSON-safe gameplay contract', () => {
  const state = createGameState();
  assert.equal(state.phase, 'briefing');
  assert.equal(state.timeRemaining, 180);
  assert.equal(state.player.energy, 100);
  assert.equal(state.player.integrity, 100);
  assert.deepEqual(state.inventory, { cells: 2, coolant: 1 });
  assert.equal(state.repairs.coolant_loop.status, 'available');
  assert.equal(state.repairs.district_core.status, 'locked');
  assert.equal(REPAIR_NODES.length, 5);
  assert.deepEqual(
    REPAIR_NODES.reduce(
      (total, node) => ({ cells: total.cells + node.cost.cells, coolant: total.coolant + node.cost.coolant }),
      { cells: 0, coolant: 0 }
    ),
    { cells: 6, coolant: 3 }
  );
  assert.deepEqual(
    SUPPLY_CACHES.reduce(
      (total, cache) => ({
        cells: total.cells + cache.reward.cells,
        coolant: total.coolant + cache.reward.coolant
      }),
      { ...state.inventory }
    ),
    { cells: 6, coolant: 3 }
  );

  const roundTrip = JSON.parse(JSON.stringify(state));
  assert.deepEqual(roundTrip, state);
});

test('briefing does not simulate until the shift starts', () => {
  const state = createGameState();
  assert.equal(tickGame(state, {}, 12).simulated, 0);
  assert.equal(state.elapsed, 0);
  assert.deepEqual(startShift(state), { type: 'shift-started', duration: 180 });
  assert.equal(startShift(state), null);
  assert.equal(state.phase, 'active');
});

test('positions are clamped and nearest repair lookup respects range', () => {
  const state = activeState();
  const coolant = REPAIR_NODES.find((node) => node.id === 'coolant_loop');
  assert.equal(nearestRepairNode(coolant.position, state)?.id, coolant.id);
  assert.equal(nearestRepairNode({ x: 0, z: 0 }, state, 0.5), null);
  tickGame(state, { position: { x: 999, z: -999 } }, 0);
  assert.deepEqual(state.player.position, { x: 18, z: -18 });
  assert.equal(distance2D({ x: 0, z: 0 }, { position: { x: 3, z: 4 } }), 5);
});

test('walking over a cache collects its reward exactly once', () => {
  const state = activeState();
  state.player.energy = 40;
  const cache = SUPPLY_CACHES[0];
  const first = tickGame(state, { position: cache.position }, 0.05);
  assert.equal(eventOf(first, 'cache-collected')?.cacheId, cache.id);
  assert.deepEqual(state.inventory, { cells: 4, coolant: 1 });
  assert.equal(state.player.energy > 40, true);
  assert.equal(state.stats.cachesCollected, 1);

  const second = tickGame(state, { position: cache.position }, 0.05);
  assert.equal(eventOf(second, 'cache-collected'), undefined);
  assert.equal(state.stats.cachesCollected, 1);
});

test('holding repair spends resources, completes a system, and awards score', () => {
  const state = activeState();
  const node = REPAIR_NODES.find((candidate) => candidate.id === 'coolant_loop');
  const result = tickGame(state, { position: node.position, repairing: true }, node.duration + 0.1);

  assert.equal(eventOf(result, 'repair-started')?.repairId, node.id);
  assert.equal(eventOf(result, 'repair-completed')?.repairId, node.id);
  assert.equal(state.repairs[node.id].status, 'repaired');
  assert.equal(state.repairs[node.id].progress, 1);
  assert.equal(state.inventory.cells, 1);
  assert.equal(state.repairCount, 1);
  assert.equal(state.score, node.score);
});

test('locked and under-supplied repairs report stable block reasons', () => {
  const state = activeState();
  const signal = REPAIR_NODES.find((node) => node.id === 'signal_array');
  const locked = tickGame(state, { position: signal.position, repairing: true }, 0.1);
  assert.equal(eventOf(locked, 'repair-blocked')?.reason, 'dependency');
  assert.equal(locked.interaction.blockedReason, 'dependency');
  assert.equal(eventOf(tickGame(state, { repairing: true }, 0.1), 'repair-blocked'), undefined);

  const coolant = REPAIR_NODES.find((node) => node.id === 'coolant_loop');
  state.inventory.cells = 0;
  const empty = tickGame(state, { position: coolant.position, repairing: true }, 0.1);
  assert.equal(eventOf(empty, 'repair-blocked')?.reason, 'cells');
});

test('partial repair progress decays when the player lets go', () => {
  const state = activeState();
  const node = REPAIR_NODES[0];
  const repairing = tickGame(state, { position: node.position, repairing: true }, 1);
  assert.equal(repairing.objective.repairId, node.id);
  assert.equal(repairing.objective.status, 'repairing');
  const heldProgress = state.repairs[node.id].progress;
  const result = tickGame(state, { position: node.position, repairing: false }, 1);
  assert.equal(eventOf(result, 'repair-paused')?.reason, 'released');
  assert.equal(state.repairs[node.id].progress < heldProgress, true);
  assert.equal(state.repairs[node.id].progress > 0, true);
});

test('holding repair at zero energy cannot exploit passive recharge', () => {
  const state = activeState();
  const node = REPAIR_NODES[0];
  state.player.energy = 0;
  const result = tickGame(state, { position: node.position, repairing: true }, node.duration + 1);
  assert.equal(eventOf(result, 'repair-blocked')?.reason, 'energy');
  assert.equal(state.repairs[node.id].progress, 0);
  assert.equal(state.repairs[node.id].status, 'available');
  assert.equal(state.player.energy, 0);

  tickGame(state, { position: node.position, repairing: false }, 1);
  assert.equal(state.player.energy > 0, true);
});

test('hazards drain suit systems, emit boundary events, and cool after exit', () => {
  const state = activeState();
  const hazard = HAZARDS[0];
  const inside = tickGame(state, { position: hazard.position }, 1);
  assert.equal(eventOf(inside, 'hazard-entered')?.hazardId, hazard.id);
  assert.equal(state.player.energy < 100, true);
  assert.equal(state.player.integrity < 100, true);
  assert.equal(state.player.heat > 0, true);
  const hot = state.player.heat;

  const outside = tickGame(state, { position: { x: 16, z: 16 } }, 1);
  assert.equal(eventOf(outside, 'hazard-exited')?.hazardId, hazard.id);
  assert.equal(state.player.heat < hot, true);
});

test('overheat locks repair until the suit cools below the recovery threshold', () => {
  const state = activeState();
  state.player.heat = 99.5;
  const overheated = tickGame(state, { position: HAZARDS[0].position }, 0.1);
  assert.equal(eventOf(overheated, 'player-overheated')?.type, 'player-overheated');
  assert.equal(state.player.overheated, true);

  const node = REPAIR_NODES[0];
  const blocked = tickGame(state, { position: node.position, repairing: true }, 0.1);
  assert.equal(eventOf(blocked, 'repair-blocked')?.reason, 'heat');
  const cooled = tickGame(state, { position: node.position }, 5);
  assert.equal(eventOf(cooled, 'player-cooled')?.type, 'player-cooled');
  assert.equal(state.player.overheated, false);
});

test('scheduled waves start and end once at deterministic boundaries', () => {
  const state = activeState();
  const wave = WAVE_SCHEDULE[0];
  tickGame(state, { position: { x: 16, z: 16 } }, wave.startsAt - 0.05);
  const started = tickGame(state, {}, 0.1);
  assert.equal(eventOf(started, 'wave-started')?.waveId, wave.id);
  assert.equal(state.wave.active, true);
  assert.equal(eventOf(tickGame(state, {}, 0.1), 'wave-started'), undefined);

  const untilEnd = wave.startsAt + wave.duration - state.elapsed + 0.05;
  const ended = tickGame(state, {}, untilEnd);
  assert.equal(eventOf(ended, 'wave-ended')?.waveId, wave.id);
  assert.equal(state.stats.wavesSurvived, 1);
  assert.equal(state.wave.active, false);
});

test('scan spends energy, reveals unresolved targets, and observes cooldown', () => {
  const state = activeState();
  const first = triggerScan(state);
  assert.equal(first.type, 'scan-triggered');
  assert.equal(first.energyCost, DISTRICT_CONFIG.scanCost);
  assert.equal(first.repairIds.length, REPAIR_NODES.length);
  assert.equal(first.cacheIds.length, SUPPLY_CACHES.length);
  assert.equal(state.player.energy, 88);
  assert.equal(triggerScan(state), null);

  tickGame(state, { position: { x: 16, z: 16 } }, DISTRICT_CONFIG.scanCooldown + 0.1);
  assert.equal(triggerScan(state)?.type, 'scan-triggered');
});

test('repair dependency chain unlocks and all systems produce a win', () => {
  const state = activeState();
  const completionEvents = [];

  for (const cache of SUPPLY_CACHES) tickGame(state, { position: cache.position }, 0.05);

  for (const node of REPAIR_NODES) {
    // Real traversal provides a short recharge window between work sites.
    tickGame(state, { position: node.position, repairing: false }, 1.5);
    const result = tickGame(state, { position: node.position, repairing: true }, node.duration + 0.1);
    completionEvents.push(...result.events.filter((event) => event.type === 'repair-completed'));
  }

  assert.deepEqual(completionEvents.map((event) => event.repairId), REPAIR_NODES.map((node) => node.id));
  assert.equal(state.phase, 'won');
  assert.equal(state.complete, true);
  assert.equal(state.outcome, 'district-restored');
  assert.equal(state.repairCount, REPAIR_NODES.length);
  assert.deepEqual(state.inventory, { cells: 0, coolant: 0 });
  assert.equal(getObjective(state).status, 'complete');
});

test('timer expiry and zero integrity produce distinct loss outcomes', () => {
  const timeout = activeState();
  const timedOut = tickGame(timeout, { position: { x: 16, z: 16 } }, DISTRICT_CONFIG.shiftDuration);
  assert.equal(timeout.phase, 'lost');
  assert.equal(timeout.outcome, 'timeout');
  assert.equal(timeout.timeRemaining, 0);
  assert.equal(eventOf(timedOut, 'shift-lost')?.reason, 'timeout');

  const brokenSuit = activeState();
  brokenSuit.player.integrity = 0.1;
  const destroyed = tickGame(brokenSuit, { position: HAZARDS[1].position }, 0.1);
  assert.equal(brokenSuit.phase, 'lost');
  assert.equal(brokenSuit.outcome, 'integrity');
  assert.equal(eventOf(destroyed, 'shift-lost')?.reason, 'integrity');
});

test('bounded internal stepping makes coarse and fine ticks equivalent', () => {
  const coarse = activeState();
  const fine = activeState();
  tickGame(coarse, { position: HAZARDS[2].position }, 1);
  for (let index = 0; index < 10; index += 1) tickGame(fine, { position: HAZARDS[2].position }, 0.1);

  assert.ok(Math.abs(coarse.player.energy - fine.player.energy) < 1e-8);
  assert.ok(Math.abs(coarse.player.heat - fine.player.heat) < 1e-8);
  assert.ok(Math.abs(coarse.player.integrity - fine.player.integrity) < 1e-8);
  assert.ok(Math.abs(coarse.elapsed - fine.elapsed) < 1e-8);
});

test('60 Hz and 120 Hz callers stay gameplay-equivalent', () => {
  const simulate = (fps) => {
    const state = activeState();
    const events = [];
    for (let frame = 0; frame < fps * 10; frame += 1) {
      events.push(...tickGame(state, { position: HAZARDS[0].position }, 1 / fps).events);
    }
    return { state, events };
  };
  const at60 = simulate(60);
  const at120 = simulate(120);

  assert.ok(Math.abs(at60.state.player.energy - at120.state.player.energy) < 1e-6);
  assert.ok(Math.abs(at60.state.player.heat - at120.state.player.heat) < 1e-6);
  assert.ok(Math.abs(at60.state.player.integrity - at120.state.player.integrity) < 0.02);
  assert.equal(at60.events.filter((event) => event.type === 'hazard-entered').length, 1);
  assert.equal(at120.events.filter((event) => event.type === 'hazard-entered').length, 1);
});

test('time formatter is stable for HUD input edge cases', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(125.9), '02:05');
  assert.equal(formatTime(-8), '00:00');
  assert.equal(formatTime(Number.NaN), '00:00');
});
