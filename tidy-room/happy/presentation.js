// Native box tracks are sampled directly from the exported Unity AnimationClips.
export function sampleTrack(track, time, fallback = 0) {
  if (!track) return fallback;
  if (typeof track.constant === "number") return track.constant;
  const keys = track.keys;
  if (!keys?.length) return fallback;
  let index = 0;
  while (index + 1 < keys.length && time >= keys[index + 1].t) index++;
  const key = keys[index];
  if (index === keys.length - 1 || time <= key.t || track.property === "m_IsActive") return key.value;
  const dt = time - key.t;
  return ((key.c[0] * dt + key.c[1]) * dt + key.c[2]) * dt + key.c[3];
}

export const QUEUE_ITEM_EXTENT = 104;

// Fit the transformed silhouette, retaining the level's rotation, reflection and aspect ratio.
export function paintItem(context, image, item, x, y, extent, alpha = 1) {
  const angle = -item.angle * Math.PI / 180;
  const width = image.width * Math.abs(item.scaleX);
  const height = image.height * Math.abs(item.scaleY);
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const scale = extent / Math.max(width * c + height * s, width * s + height * c, 1);
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.rotate(angle);
  context.scale(item.scaleX * scale, item.scaleY * scale);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  context.restore();
}

export function boxFlightPose(from, mouth, progress, targetSize) {
  // Use the end of the flight for the landing feedback after the sprite is inside.
  const travel = Math.max(0, Math.min(1, progress / .86));
  const rise = Math.min(1, travel / .66);
  const fall = Math.max(0, (travel - .66) / .34);
  const alignment = Math.min(1, travel / .92);
  const size = Math.min(targetSize, mouth.width * .64);
  const apex = mouth.y - size * .58;
  const landing = mouth.y + size * .6;
  const lift = rise * (2 - rise);
  return {
    x: from.x + (mouth.x - from.x) * alignment * alignment * (3 - 2 * alignment),
    y: from.y + (apex - from.y) * lift + (landing - apex) * fall * fall,
    size: from.size + (size - from.size) * lift,
    behindRim: travel >= .66,
    inside: travel === 1
  };
}

const SWEEP_CONTACT = .24;
const SWEEP_END = .77;

function smoothStep(progress) {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * (3 - 2 * t);
}

export function paintSweptItem(context, image, item, from, mouth, progress, sweepStartX) {
  const across = Math.min(1, Math.max(0, (from.x - sweepStartX) / (mouth.x - sweepStartX)));
  // Release each object when the brush reaches its slot, then stagger arrivals at the rim.
  const contact = SWEEP_CONTACT + (SWEEP_END - SWEEP_CONTACT) * across;
  const arrival = .64 + .32 * across;
  const travel = Math.max(0, (progress - contact) / (arrival - contact));
  if (travel >= 1) return;
  const slide = travel * (.72 + .28 * travel);
  const drop = Math.max(0, (travel - .72) / .28);
  const x = from.x + (mouth.x - from.x) * slide;
  const y = from.y + (mouth.y - from.y) * slide - Math.sin(Math.PI * travel) * from.size * .59 + from.size * .32 * drop ** 2;
  const size = from.size * (1 - .43 * drop ** 2);
  context.save();
  if (drop > 0 && x >= mouth.x - mouth.width * .36) {
    context.beginPath();
    context.rect(0, 0, mouth.x + mouth.width, mouth.y + mouth.width * .09);
    context.clip();
  }
  paintItem(context, image, item, x, y, size, Math.min(1, (1 - travel) * 9));
  context.restore();
}

export function paintSweepingBroom(context, image, from, mouth, progress, size) {
  if (progress >= 1) return;
  const windup = smoothStep(progress / .14);
  const press = smoothStep((progress - .14) / (SWEEP_CONTACT - .14));
  const stroke = Math.min(1, Math.max(0, (progress - SWEEP_CONTACT) / (SWEEP_END - SWEEP_CONTACT)));
  const release = smoothStep((progress - SWEEP_END) / (1 - SWEEP_END));
  const lift = windup - press;
  const angle = .52 * lift - .72 * smoothStep(stroke) + .45 * release;
  const x = from.x + (mouth.x - from.x) * stroke - size * (.18 + .10 * lift - .08 * release);
  const y = from.y + (mouth.y - from.y) * stroke + size * (.16 - .39 * lift - .25 * release);
  context.save();
  const opacity = 1 - release ** 2;
  if (stroke > 0 && stroke < 1) {
    context.globalAlpha = .85 * Math.sin(Math.PI * stroke);
    context.strokeStyle = "#dba75f";
    context.lineCap = "round";
    context.lineWidth = size * .045;
    context.beginPath();
    context.moveTo(x - size * .44, y - size * .08);
    context.quadraticCurveTo(x - size * .21, y + size * .09, x + size * .02, y - size * .05);
    context.moveTo(x - size * .25, y + size * .12);
    context.quadraticCurveTo(x - size * .07, y + size * .18, x + size * .13, y + size * .03);
    context.stroke();
  }
  context.globalAlpha = opacity;
  const broomHeight = size * image.height / image.width;
  // Turn around the grip while keeping the bristle tips on the sweep path.
  const gripX = size * .34, gripY = broomHeight * .19;
  const bristleX = size * .52 - gripX, bristleY = broomHeight * .91 - gripY;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  context.translate(x - bristleX * cos + bristleY * sin, y - bristleX * sin - bristleY * cos);
  context.rotate(angle);
  context.drawImage(image, -gripX, -gripY, size, broomHeight);
  context.restore();
}

export function createPresentation(host, canvas, clips, fxConfig, textures, config, onBoxClose) {
  const context = canvas.getContext("2d");
  const motions = new Map();
  const boxes = [];
  const completedBursts = new Set();
  let particles = [];
  let width = 1, height = 1, dpr = 1, hudScale = 1, paintedEffects = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const storage = host.querySelector("#storage");
  const tracks = {};
  for (const [name, clip] of Object.entries(clips)) {
    tracks[name] = new Map(clip.channels.map(track => [track.path + "/" + track.property, track]));
  }
  const value = (clip, path, property, time, fallback) =>
    sampleTrack(tracks[clip]?.get(path + "/" + property), time, fallback);

  const particleTextures = new Map();
  for (const burst of fxConfig.boxCompleteBurst) {
    const image = textures.get(burst.texture);
    const tinted = document.createElement("canvas");
    tinted.width = image.width; tinted.height = image.height;
    const ctx = tinted.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, tinted.width, tinted.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] *= burst.color[0];
      pixels.data[i + 1] *= burst.color[1];
      pixels.data[i + 2] *= burst.color[2];
    }
    ctx.putImageData(pixels, 0, 0);
    particleTextures.set(burst.name, tinted);
  }

  function center(element) {
    const rect = element.getBoundingClientRect(), root = host.getBoundingClientRect();
    return { x: rect.left - root.left + rect.width / 2, y: rect.top - root.top + rect.height / 2, width: rect.width, height: rect.height };
  }

  function emit(x, y, time, kind, unit) {
    if (reducedMotion) return;
    const bursts = kind === "complete" ? fxConfig.boxCompleteBurst : [{
      name: "spark", count: kind === "pickup" ? 9 : 10, life: 450,
      size: [8, 24], speed: [60, 160], color: [1, 1, 1, 1]
    }, {
      name: "glow", count: 1, life: 260, size: [kind === "arrival" ? 130 : 160, kind === "arrival" ? 130 : 160],
      speed: [0, 0], color: [1, 1, 1, .8]
    }];
    for (const burst of bursts) {
      for (let i = 0; i < burst.count; i++) {
        const azimuth = Math.random() * Math.PI * 2;
        const cone = Math.random() * .65;
        const speed = (burst.speed[0] + Math.random() * (burst.speed[1] - burst.speed[0])) * unit;
        particles.push({
          texture: particleTextures.get(burst.name) || textures.get(burst.name),
          x, y: y + (burst.offsetY || 0) * unit, at: time, life: burst.life, angle: Math.random() * Math.PI * 2,
          vx: -Math.sin(cone) * Math.cos(azimuth) * speed,
          vy: -(Math.sin(cone) * Math.sin(azimuth) * .866 + Math.cos(cone) * .5) * speed,
          size: (burst.size[0] + Math.random() * (burst.size[1] - burst.size[0])) * unit,
          opacity: burst.color[3], gravity: kind === "complete" ? 90 * unit : 0
        });
      }
    }
    if (particles.length > 700) particles.splice(0, particles.length - 700);
  }

  function resize(w, h, ratio, nextHudScale) {
    const sx = w / width, sy = h / height;
    const hudRatio = nextHudScale / hudScale;
    for (const motion of motions.values()) {
      motion.from.x *= sx; motion.from.y *= sy;
      motion.size *= motion.flight.from === "board" ? sx : hudRatio;
    }
    for (const particle of particles) {
      particle.x *= sx; particle.y *= sy;
      particle.vx *= sx; particle.vy *= sy; particle.size *= hudRatio;
    }
    width = w; height = h; dpr = ratio;
    hudScale = nextHudScale;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const box of boxes) {
      box.inside.width = box.inside.height = Math.round(800 * hudScale * dpr);
    }
  }

  function reset() {
    motions.clear(); completedBursts.clear(); particles = []; boxes.length = 0;
    context.clearRect(0, 0, width, height);
    paintedEffects = false;
    storage.classList.remove("is-open");
  }

  function render(state, images, geometry, viewport, now) {
    const unit = hudScale;
    if (!boxes.length) {
      for (const element of host.querySelectorAll(".box")) {
        const inside = element.querySelector(".box-interior");
        inside.width = inside.height = Math.round(800 * unit * dpr);
        boxes.push({
          element, inside, ctx: inside.getContext("2d"),
          back: element.querySelector(".box-back"), body: element.querySelector(".box-body"),
          face: element.querySelector(".box-face"), front: element.querySelector(".box-front"),
          name: element.querySelector(".box-name"),
          lid: element.querySelector(".box-lid"), count: element.querySelector(".box-count"),
          actionAt: -Infinity, flashAt: -Infinity, orderIndex: null
        });
      }
    }

    // Trigger presentation from existing logical events. No rewards or game commands occur here.
    const active = new Set();
    for (const flight of state.flights) {
      const key = flight.itemIndex + ":" + flight.startAt + ":" + flight.to;
      active.add(key);
      let motion = motions.get(key);
      if (!motion) {
        const item = state.items[flight.itemIndex], shape = geometry[item.index];
        const from = flight.from === "board" ? {
          x: viewport.x + (shape.tx + shape.a * shape.width / 2 + shape.c * shape.height / 2) * viewport.scale,
          y: viewport.y + (shape.ty + shape.b * shape.width / 2 + shape.d * shape.height / 2) * viewport.scale
        } : center(flight.from === "queue" ? host.querySelectorAll(".slot")[flight.fromQueueIndex] : host.querySelector("#storage"));
        motion = {
          flight, from, item, orderIndex: flight.to === "box" ? state.boxes[flight.boxIndex].orderIndex : null,
          size: flight.from === "board" ? Math.max(shape.bounds.right - shape.bounds.left, shape.bounds.bottom - shape.bounds.top) * viewport.scale :
            (flight.from === "storage" ? config.boxFlySize : QUEUE_ITEM_EXTENT) * unit,
          lastTrail: flight.startAt, actionSent: false
        };
        motions.set(key, motion);
        if (flight.from === "board" && state.now - flight.startAt < 100) emit(from.x, from.y, flight.startAt, "pickup", unit);
      }
      if (flight.to === "box" && !motion.actionSent && state.now >= flight.endAt - 100) {
        boxes[flight.boxIndex].actionAt = flight.endAt - 100;
        motion.actionSent = true;
      }
    }
    for (const [key, motion] of motions) {
      if (active.has(key)) continue;
      const flight = motion.flight;
      if (flight.to === "box" && state.boxes[flight.boxIndex].orderIndex === motion.orderIndex) {
        boxes[flight.boxIndex].flashAt = flight.endAt;
        const point = center(boxes[flight.boxIndex].count);
        emit(point.x, point.y, flight.endAt, "arrival", unit);
      }
      motions.delete(key);
    }

    for (const box of state.boxes) {
      const node = boxes[box.index];
      if (node.orderIndex !== box.orderIndex) {
        node.orderIndex = box.orderIndex;
        node.actionAt = node.flashAt = -Infinity;
      }
      const completing = box.completeAt !== null;
      const actionAge = (now - node.actionAt) / 1000;
      const finished = !box.locked && box.orderIndex === null;
      const opening = reducedMotion || box.locked || finished ? 1 : Math.min(1, Math.max(0, (now - box.openedAt) / 240));
      const completionAge = completing ? now - (box.completeAt - 800) : 0;
      const closing = reducedMotion || finished ? 1 : Math.min(1, Math.max(0, (completionAge - 40) / 220));
      const departing = !reducedMotion && completing ? Math.max(0, (completionAge - 660) / 140) : 0;
      const bump = !reducedMotion && !completing && actionAge >= 0 && actionAge < clips.Box_action.duration ?
        (value("Box_action", "Body", "m_LocalScale.x", actionAge, 1) - 1) * .35 : 0;
      const scale = .96 + .04 * (1 - (1 - opening) ** 3) - .08 * departing;
      node.element.style.transform = "translateX(-50%) translateY(" + (1 - opening) ** 2 * 10 * unit + "px) scale(" + (scale + bump) + "," + (scale - bump * .5) + ")";
      node.element.style.opacity = 1 - departing;
      const flash = Math.max(0, 1 - (now - node.flashAt) / 280);
      node.count.style.transform = "scale(" + (1 + Math.sin(flash * Math.PI) * .14) + ")";
      node.lid.hidden = !completing && !finished;
      if (!node.lid.hidden) {
        node.lid.style.transform = "translateY(" + -((1 - closing) ** 2) * 70 * unit + "px)";
        node.lid.style.opacity = Math.min(1, closing * 2);
      }
      if (completing) {
        const burstKey = box.index + ":" + box.completeAt;
        const burstAt = box.completeAt - 400;
        if (now >= burstAt && !completedBursts.has(burstKey)) {
          completedBursts.add(burstKey);
          const point = center(node.element);
          if (now - burstAt < 1000) emit(point.x + 5 * unit, point.y + 16 * unit, burstAt, "complete", unit);
          if (now - burstAt < 200) onBoxClose();
        }
      }
    }

    if (paintedEffects || motions.size || particles.length) {
      context.clearRect(0, 0, width, height);
      for (const box of boxes) {
        box.ctx.setTransform(1, 0, 0, 1, 0, 0);
        box.ctx.clearRect(0, 0, box.inside.width, box.inside.height);
      }
    }
    paintedEffects = Boolean(motions.size || particles.length);
    const rootRect = host.getBoundingClientRect();
    const sweep = reducedMotion ? null : state.flights.find(flight => flight.sweptOnRevive);
    storage.classList.toggle("is-open", Boolean(sweep));
    const storageCenter = sweep && center(storage);
    const mouth = sweep && { ...storageCenter, y: storageCenter.y - storageCenter.height * .18 };
    let broomFrom;
    for (const motion of motions.values()) {
      const f = motion.flight, item = motion.item, image = images.get(item.id);
      if (state.now < f.startAt) continue;
      const elapsed = Math.max(0, state.now - f.startAt);
      const hop = f.hopDuration || 0, grow = f.growDuration || 0;
      const duration = f.flightDuration || (f.endAt - f.startAt);
      const p = Math.min(1, Math.max(0, (elapsed - hop - grow) / duration));
      if (f.sweptOnRevive) {
        if (mouth) {
          broomFrom ??= { x: motion.from.x, y: motion.from.y, progress: p };
          paintSweptItem(context, image, item, { ...motion.from, size: motion.size }, mouth, p, broomFrom.x);
        }
        continue;
      }
      const finalSize = f.to === "box" ? config.boxFlySize * unit : f.to === "queue" ? QUEUE_ITEM_EXTENT * unit : 100 * unit;
      let x = motion.from.x, y = motion.from.y, size = motion.size;
      let behindRim = false, front;
      if (hop && elapsed < hop) {
        const up = config.hopUpDuration * 1000;
        const t = elapsed < up ? elapsed / up : (elapsed - up) / (hop - up);
        const eased = 1 - (1 - t) * (1 - t);
        const height = elapsed < up ? eased : 1 - eased * .5;
        const scaleProgress = elapsed < up ? eased : 1 - eased;
        y -= config.hopHeight * unit * height;
        size *= 1 + (config.hopScale - 1) * scaleProgress;
      } else if (grow && elapsed < grow) {
        const fromScale = config.storageEndScale ?? .5;
        size = motion.size * (fromScale + (1 - fromScale) * (1 - (1 - elapsed / grow) ** 3));
      } else if (f.to === "box") {
        front = boxes[f.boxIndex].front.getBoundingClientRect();
        const mouth = {
          x: front.left - rootRect.left + front.width / 2,
          y: front.top - rootRect.top + front.height * .19,
          width: front.width * .86
        };
        const from = { x, y: y - (hop ? config.hopHeight * unit / 2 : 0), size };
        const pose = boxFlightPose(from, mouth, p, finalSize);
        if (pose.inside) continue;
        ({ x, y, size, behindRim } = pose);
      } else {
        const target = center(f.to === "queue" ? host.querySelectorAll(".slot")[f.queueIndex] : host.querySelector("#storage"));
        const eased = 1 - (1 - p) ** 2;
        x += (target.x - x) * eased;
        y += (target.y - y) * eased - Math.sin(p * Math.PI) * config.flyJump * unit;
        size += (finalSize - size) * eased;
        if (f.to === "storage" && p > config.storageShrinkStart) size *= 1 - (p - config.storageShrinkStart) / (1 - config.storageShrinkStart) * .95;
      }
      if (state.now - motion.lastTrail >= 30 && !reducedMotion && !behindRim) {
        motion.lastTrail = state.now;
        particles.push({
          texture: textures.get("spark"), x, y, at: now, life: 350, angle: Math.random() * Math.PI,
          vx: 0, vy: 12 * unit, size: (10 + Math.random() * 14) * unit, opacity: .85, gravity: 0
        });
      }
      if (behindRim) {
        const box = boxes[f.boxIndex];
        const left = front.left - rootRect.left, top = front.top - rootRect.top;
        context.save();
        context.beginPath();
        context.rect(0, 0, width, height);
        context.rect(left, top, front.width, front.height);
        context.clip("evenodd");
        paintItem(context, image, item, x, y, size);
        context.restore();
        const inside = box.inside.getBoundingClientRect();
        const scaleX = box.inside.width / inside.width, scaleY = box.inside.height / inside.height;
        box.ctx.setTransform(scaleX, 0, 0, scaleY, -(inside.left - rootRect.left) * scaleX, -(inside.top - rootRect.top) * scaleY);
        box.ctx.save();
        box.ctx.beginPath(); box.ctx.rect(left, top, front.width, front.height); box.ctx.clip();
        paintItem(box.ctx, image, item, x, y, size);
        box.ctx.restore();
      } else paintItem(context, image, item, x, y, size);
    }
    if (broomFrom) paintSweepingBroom(context, textures.get("reviveBroom"), broomFrom, mouth, broomFrom.progress, 116 * unit);

    particles = particles.filter(particle => now - particle.at < particle.life);
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const particle of particles) {
      const age = now - particle.at;
      if (age < 0) continue;
      const seconds = age / 1000, progress = age / particle.life;
      const size = particle.size * (1 - progress * .55);
      context.save();
      context.globalAlpha = particle.opacity * (1 - progress);
      context.translate(particle.x + particle.vx * seconds, particle.y + particle.vy * seconds + particle.gravity * seconds * seconds);
      context.rotate(particle.angle + seconds * .8);
      context.drawImage(particle.texture, -size / 2, -size / 2, size, size);
      context.restore();
    }
    context.restore();
  }

  return { resize, reset, render };
}

