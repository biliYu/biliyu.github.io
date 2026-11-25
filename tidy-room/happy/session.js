const PICK_DURATION = 500;
const TRANSFER_DURATION = 700;
const PICK_HOP_DURATION = 220;
const STORAGE_GROW_DURATION = 150;
const BOX_COMPLETE_DELAY = 800;
const STORAGE_INTERVAL = 120;
const CURRENT_TIMING_PROFILE = 2;

function layoutSignature(level, items, blockers, queueCapacity, openBoxes, maxBoxes) {
  const text = JSON.stringify([level, items.map(item => item.subgroup), blockers, queueCapacity, openBoxes, maxBoxes]);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16) + ":" + text.length;
}

export function createSession(level, options = {}) {
  const { subgroups = {}, blockers = [], queueCapacity = 5, openBoxes = 2, maxBoxes = 3 } = options;
  if (!Array.isArray(level?.content) || !Array.isArray(level.order)) throw new TypeError("Level requires content and order arrays");
  if (![queueCapacity, openBoxes, maxBoxes].every(Number.isInteger) || queueCapacity < 1 || openBoxes < 1 || maxBoxes < openBoxes) {
    throw new RangeError("Invalid queue capacity or box count");
  }
  const items = level.content.map((content, index) => {
    const subgroup = Number(subgroups[content.id] ?? content.subGroup);
    if (!Number.isInteger(subgroup)) throw new TypeError("Missing subgroup for " + content.id);
    return { ...content, index, subgroup, zone: "board", boxIndex: null, queueIndex: null };
  });
  const blocking = items.map((item, index) => [...(blockers[index] || [])].sort((a, b) => a - b));
  if (blocking.some((list, index) => list.some(other => !Number.isInteger(other) || other < 0 || other >= items.length || other === index))) {
    throw new RangeError("Invalid blocker index");
  }
  const available = new Map();
  for (const item of items) available.set(item.subgroup, (available.get(item.subgroup) || 0) + 1);
  for (const order of level.order) {
    if (!Number.isInteger(order.type) || !Number.isInteger(order.count) || order.count < 1) throw new TypeError("Invalid order");
    available.set(order.type, (available.get(order.type) || 0) - order.count);
  }
  if ([...available.values()].some(count => count !== 0)) throw new RangeError("Item totals must match order totals by subgroup");

  const state = {
    level,
    layoutSignature: layoutSignature(level, items, blocking, queueCapacity, openBoxes, maxBoxes),
    items,
    blockers: blocking,
    initialTimingProfile: CURRENT_TIMING_PROFILE,
    timingProfile: CURRENT_TIMING_PROFILE,
    boxes: Array.from({ length: maxBoxes }, (_, index) => ({
      index,
      locked: index >= openBoxes,
      orderIndex: index < openBoxes && index < level.order.length ? index : null,
      reserved: [],
      arrived: 0,
      completeAt: null,
      openedAt: 0
    })),
    queue: Array(queueCapacity).fill(null),
    storage: [],
    flights: [],
    now: 0,
    nextStorageLaunch: 0,
    nextOrderIndex: Math.min(openBoxes, level.order.length),
    completedOrders: 0,
    reviveCount: 0,
    status: level.order.length ? "playing" : "won",
    paused: false,
    inputLocks: 0,
    actions: []
  };
  return state;
}

function inputReason(state) {
  if (state.status !== "playing") return "inactive";
  if (state.paused) return "paused";
  if (state.inputLocks > 0) return "locked";
  return null;
}

export function acceptingBox(state, subgroup) {
  let selected = null;
  for (const box of state.boxes) {
    const order = state.level.order[box.orderIndex];
    if (box.locked || box.completeAt !== null || !order || order.type !== subgroup || box.reserved.length >= order.count) continue;
    if (!selected || box.reserved.length > selected.reserved.length) selected = box;
  }
  return selected;
}

export function canPick(state, index) {
  return Number.isInteger(index) && !inputReason(state) && state.queue.includes(null) && state.items[index]?.zone === "board" &&
    !state.blockers[index].some(other => state.items[other].zone === "board");
}

function flightTiming(from, to, isVacuum, profile) {
  let hopDuration = 0;
  let growDuration = 0;
  let flightDuration = from === "board" || to === "storage" ? PICK_DURATION : TRANSFER_DURATION;
  if (profile === CURRENT_TIMING_PROFILE && to === "box" && !isVacuum) {
    flightDuration = TRANSFER_DURATION;
    if (from === "board") hopDuration = PICK_HOP_DURATION;
    if (from === "storage") growDuration = STORAGE_GROW_DURATION;
  }
  return { hopDuration, growDuration, flightDuration };
}

function launch(state, index, to, boxIndex = null, queueIndex = null, startAt = state.now, isVacuum = false) {
  const item = state.items[index];
  const from = item.zone;
  const fromQueueIndex = item.queueIndex;
  if (from === "queue") state.queue[fromQueueIndex] = null;
  if (from === "storage") state.storage.splice(state.storage.indexOf(index), 1);
  if (to === "box") state.boxes[boxIndex].reserved.push(index);
  if (to === "queue") state.queue[queueIndex] = index;
  if (to === "storage") state.storage.push(index);
  item.zone = "flying";
  item.boxIndex = boxIndex;
  item.queueIndex = queueIndex;
  const timing = flightTiming(from, to, isVacuum, state.timingProfile);
  const duration = timing.hopDuration + timing.growDuration + timing.flightDuration;
  const flight = { itemIndex: index, from, to, fromQueueIndex, boxIndex, queueIndex, isVacuum,
    startAt, endAt: startAt + duration, ...timing };
  state.flights.push(flight);
  return flight;
}

function retime(state) {
  if (state.timingProfile !== 1) return { ok: false, reason: "already-current" };
  for (const flight of state.flights) {
    const timing = flightTiming(flight.from, flight.to, flight.isVacuum, CURRENT_TIMING_PROFILE);
    const previousDuration = flight.hopDuration + flight.growDuration + flight.flightDuration;
    const duration = timing.hopDuration + timing.growDuration + timing.flightDuration;
    if (duration !== previousDuration) {
      if (flight.startAt < state.now) {
        const progress = (state.now - flight.startAt) / (flight.endAt - flight.startAt);
        flight.startAt = state.now - progress * duration;
      }
      flight.endAt = flight.startAt + duration;
    }
    Object.assign(flight, timing);
  }
  state.timingProfile = CURRENT_TIMING_PROFILE;
  state.actions.push({ type: "retime", at: state.now, profile: CURRENT_TIMING_PROFILE });
  return { ok: true };
}

function compactQueue(state) {
  const occupied = state.queue.filter(index => index !== null);
  state.queue.fill(null);
  for (let slot = 0; slot < occupied.length; slot++) {
    const index = occupied[slot];
    state.queue[slot] = index;
    state.items[index].queueIndex = slot;
    const flight = state.flights.find(move => move.itemIndex === index && move.to === "queue");
    if (flight) flight.queueIndex = slot;
  }
}

function resolveWaiting(state) {
  for (const index of state.queue) {
    if (index === null || state.items[index].zone !== "queue") continue;
    const box = acceptingBox(state, state.items[index].subgroup);
    if (box) launch(state, index, "box", box.index);
  }
  compactQueue(state);
  for (const index of [...state.storage]) {
    if (state.items[index].zone !== "storage") continue;
    const box = acceptingBox(state, state.items[index].subgroup);
    if (!box) continue;
    const startAt = Math.max(state.now, state.nextStorageLaunch);
    launch(state, index, "box", box.index, null, startAt);
    state.nextStorageLaunch = startAt + STORAGE_INTERVAL;
  }
}

function evaluate(state) {
  if (state.completedOrders === state.level.order.length) state.status = "won";
  else if (!state.flights.length && !state.boxes.some(box => box.completeAt !== null) && !state.queue.includes(null)) state.status = "lost";
}

export function pick(state, index) {
  const reason = inputReason(state);
  if (reason) return { ok: false, reason };
  if (!state.queue.includes(null)) return { ok: false, reason: "queue-full" };
  const item = Number.isInteger(index) ? state.items[index] : null;
  if (!item || item.zone !== "board") return { ok: false, reason: "unavailable" };
  if (state.blockers[index].some(other => state.items[other].zone === "board")) return { ok: false, reason: "covered" };
  const box = acceptingBox(state, item.subgroup);
  const queueIndex = box ? null : state.queue.indexOf(null);
  launch(state, index, box ? "box" : "queue", box?.index ?? null, queueIndex);
  state.actions.push({ type: "pick", at: state.now, index });
  return { ok: true, destination: box ? "box" : "queue", boxIndex: box?.index ?? null, queueIndex, itemIndices: [index] };
}

export function prefillTutorial(state, requestedCount) {
  const reason = inputReason(state);
  if (reason) return { ok: false, reason };
  if (!Number.isInteger(requestedCount) || requestedCount < 0) return { ok: false, reason: "invalid-count" };
  const limit = Math.max(0, Math.min(requestedCount, state.queue.filter(index => index === null).length - 1));
  // Native Prefill builds this list before taking anything, preserving the original board order.
  const indices = state.items.filter(item => canPick(state, item.index) && !acceptingBox(state, item.subgroup))
    .slice(0, limit).map(item => item.index);
  if (!indices.length) return { ok: false, reason: "no-target" };
  for (const index of indices) {
    const slot = state.queue.indexOf(null);
    state.queue[slot] = index;
    state.items[index].zone = "queue";
    state.items[index].boxIndex = null;
    state.items[index].queueIndex = slot;
  }
  state.actions.push({ type: "prefill", at: state.now, count: requestedCount });
  return { ok: true, itemIndices: indices };
}

export function advance(state, deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0 || !Number.isFinite(state.now + deltaMs)) return { ok: false, reason: "invalid-time" };
  if (state.paused || state.status !== "playing") return { ok: true, changed: false };
  const endTime = state.now + deltaMs;
  let changed = deltaMs > 0 && (state.flights.length > 0 || state.boxes.some(box => box.completeAt !== null));
  while (state.status === "playing") {
    let eventTime = Infinity;
    for (const flight of state.flights) eventTime = Math.min(eventTime, flight.endAt);
    for (const box of state.boxes) {
      if (box.completeAt !== null) eventTime = Math.min(eventTime, box.completeAt);
    }
    if (eventTime > endTime) break;
    state.now = eventTime;
    changed = true;
    const arrived = state.flights.filter(flight => flight.endAt <= eventTime);
    state.flights = state.flights.filter(flight => flight.endAt > eventTime);
    for (const flight of arrived) {
      state.items[flight.itemIndex].zone = flight.to;
      if (flight.to === "box") {
        const box = state.boxes[flight.boxIndex];
        box.arrived++;
        if (box.arrived === state.level.order[box.orderIndex].count) box.completeAt = eventTime + BOX_COMPLETE_DELAY;
      }
    }
    for (const box of state.boxes) {
      if (box.completeAt === null || box.completeAt > eventTime) continue;
      for (const index of box.reserved) {
        state.items[index].zone = "done";
        state.items[index].boxIndex = null;
      }
      state.completedOrders++;
      box.reserved = [];
      box.arrived = 0;
      box.completeAt = null;
      box.orderIndex = state.nextOrderIndex < state.level.order.length ? state.nextOrderIndex++ : null;
      if (box.orderIndex !== null) box.openedAt = eventTime;
    }
    resolveWaiting(state);
    evaluate(state);
  }
  if (state.status === "playing") state.now = endTime;
  return { ok: true, changed };
}

export function clearQueue(state) {
  const reason = inputReason(state);
  if (reason) return { ok: false, reason };
  const indices = state.queue.filter(index => index !== null && state.items[index].zone === "queue");
  if (!indices.length) return { ok: false, reason: "empty-queue" };
  for (const index of indices) launch(state, index, "storage");
  compactQueue(state);
  state.actions.push({ type: "clear", at: state.now });
  return { ok: true, itemIndices: indices };
}

export function vacuum(state) {
  const reason = inputReason(state);
  if (reason) return { ok: false, reason };
  const candidates = state.boxes.filter(box => !box.locked && box.orderIndex !== null && box.completeAt === null)
    .map(box => ({ box, free: state.level.order[box.orderIndex].count - box.reserved.length }))
    .filter(candidate => candidate.free > 0)
    .sort((a, b) => a.free - b.free || a.box.index - b.box.index);
  for (const { box, free } of candidates) {
    const subgroup = state.level.order[box.orderIndex].type;
    const matching = state.items.filter(item => item.zone === "board" && item.subgroup === subgroup);
    if (matching.length < free) continue;
    const ranked = matching.map(item => {
      const ancestors = new Set();
      const pending = [...state.blockers[item.index]];
      while (pending.length) {
        const index = pending.pop();
        if (state.items[index].zone !== "board" || ancestors.has(index)) continue;
        ancestors.add(index);
        pending.push(...state.blockers[index]);
      }
      return { index: item.index, uncovered: ancestors.size === 0, depth: ancestors.size };
    });
    // APK Execute: CanPick descending, unique transitive blocker count ascending, Layer descending.
    ranked.sort((a, b) => Number(b.uncovered) - Number(a.uncovered) || a.depth - b.depth || b.index - a.index);
    const selected = ranked.slice(0, free).map(item => item.index);
    for (const index of selected) launch(state, index, "box", box.index, null, state.now, true);
    state.actions.push({ type: "vacuum", at: state.now });
    return { ok: true, boxIndex: box.index, itemIndices: selected };
  }
  return { ok: false, reason: "no-target" };
}

export function unlockBox(state) {
  const reason = inputReason(state);
  if (reason) return { ok: false, reason };
  const box = state.boxes.find(candidate => candidate.locked);
  if (!box) return { ok: false, reason: "no-locked-box" };
  if (state.nextOrderIndex >= state.level.order.length) return { ok: false, reason: "no-order" };
  box.locked = false;
  box.orderIndex = state.nextOrderIndex++;
  box.openedAt = state.now;
  state.actions.push({ type: "unlock", at: state.now });
  resolveWaiting(state);
  evaluate(state);
  return { ok: true, boxIndex: box.index };
}

export function revive(state) {
  if (state.status !== "lost") return { ok: false, reason: "not-lost" };
  if (state.paused || state.inputLocks > 0) return { ok: false, reason: "locked" };
  state.status = "playing";
  state.reviveCount++;
  const indices = state.queue.filter(index => index !== null);
  for (const index of indices) launch(state, index, "storage").sweptOnRevive = true;
  compactQueue(state);
  state.actions.push({ type: "revive", at: state.now });
  return { ok: true, itemIndices: indices };
}

export function snapshot(state) {
  // Successful commands plus the logical clock reconstruct reservations and in-flight animations through the same rules.
  return {
    version: 2,
    initialTimingProfile: state.initialTimingProfile,
    layoutSignature: state.layoutSignature,
    now: state.now,
    paused: state.paused,
    inputLocks: state.inputLocks,
    actions: state.actions.map(action => ({ ...action }))
  };
}

export function restoreSession(level, options, saved) {
  const state = createSession(level, options);
  if (![1, 2].includes(saved?.version) || saved.layoutSignature !== state.layoutSignature || !Number.isFinite(saved.now) || saved.now < 0 ||
      !Array.isArray(saved.actions) || saved.actions.length > state.items.length * 3 + state.boxes.length + 1 ||
      typeof saved.paused !== "boolean" || !Number.isInteger(saved.inputLocks) || saved.inputLocks < 0) return state;
  const initialTimingProfile = saved.version === 1 ? 1 : saved.initialTimingProfile;
  if (![1, CURRENT_TIMING_PROFILE].includes(initialTimingProfile)) return state;
  state.initialTimingProfile = state.timingProfile = initialTimingProfile;
  const commands = { clear: clearQueue, vacuum, unlock: unlockBox, revive };
  for (const action of saved.actions) {
    if (!action || !Number.isFinite(action.at) || action.at < state.now || action.at > saved.now) return createSession(level, options);
    advance(state, action.at - state.now);
    if (state.now !== action.at) return createSession(level, options);
    let result;
    if (action.type === "pick" && Number.isInteger(action.index)) result = pick(state, action.index);
    else if (action.type === "prefill") result = prefillTutorial(state, action.count);
    else if (action.type === "retime" && saved.version === 2 && action.profile === CURRENT_TIMING_PROFILE) result = retime(state);
    else if (Object.prototype.hasOwnProperty.call(commands, action.type)) result = commands[action.type](state);
    if (!result?.ok) return createSession(level, options);
  }
  advance(state, saved.now - state.now);
  if (state.now !== saved.now) return createSession(level, options);
  // Reconstruct old commands at their original times before changing any in-flight durations.
  if (state.timingProfile === 1) retime(state);
  state.paused = saved.paused;
  state.inputLocks = saved.inputLocks;
  return state;
}
