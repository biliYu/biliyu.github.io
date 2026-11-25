// MapCamera evidence: zoomSmooth 14, flingDamping 4, overZoom .12, wheelStep 1.12.
// The viewport keeps the Web build's cover-fit composition.
export function createCamera(canvas, { onTap = () => {}, onInteraction = () => {}, canInteract = () => true } = {}) {
  const view = { width: 1, height: 1, scale: 1, x: 0, y: 0 };
  const pointers = new Map();
  let sceneWidth = 1, sceneHeight = 1, fit = 1, zoom = 1, targetZoom = 1, maxZoom = 2;
  let velocityX = 0, velocityY = 0, lastMotionAt = 0;
  let focusX = .5, focusY = .5, focusWorldX = .5, focusWorldY = .5;
  let wheelTimeLeft = 0;
  let gesture = null, tapAllowed = false, dirty = true, destroyed = false;

  function constrain(elastic) {
    const sizeX = sceneWidth * view.scale, sizeY = sceneHeight * view.scale;
    const minX = sizeX > view.width ? view.width - sizeX : (view.width - sizeX) / 2;
    const minY = sizeY > view.height ? view.height - sizeY : (view.height - sizeY) / 2;
    const maxX = sizeX > view.width ? 0 : minX;
    const maxY = sizeY > view.height ? 0 : minY;
    const boundX = Math.max(minX, Math.min(maxX, view.x));
    const boundY = Math.max(minY, Math.min(maxY, view.y));
    const excessX = view.x - boundX, excessY = view.y - boundY;
    view.x = elastic ? boundX + excessX / (1 + Math.abs(excessX) / (view.width * .12)) : boundX;
    view.y = elastic ? boundY + excessY / (1 + Math.abs(excessY) / (view.height * .12)) : boundY;
  }

  function cancel() {
    const previousX = view.x, previousY = view.y, previousScale = view.scale;
    const ids = Array.from(pointers.keys());
    pointers.clear();
    gesture = null;
    tapAllowed = false;
    velocityX = velocityY = 0;
    zoom = Math.max(1, Math.min(maxZoom, zoom));
    targetZoom = zoom;
    wheelTimeLeft = 0;
    view.scale = fit * zoom;
    const ratio = view.scale / previousScale;
    view.x = focusX - (focusX - view.x) * ratio;
    view.y = focusY - (focusY - view.y) * ratio;
    constrain(false);
    focusWorldX = (focusX - view.x) / view.scale;
    focusWorldY = (focusY - view.y) / view.scale;
    for (const id of ids) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    dirty = dirty || previousX !== view.x || previousY !== view.y || previousScale !== view.scale;
  }

  function rebaseGesture() {
    const points = Array.from(pointers.values());
    velocityX = velocityY = 0;
    if (points.length > 1) {
      const x = (points[0].x + points[1].x) / 2;
      const y = (points[0].y + points[1].y) / 2;
      focusX = x;
      focusY = y;
      focusWorldX = (x - view.x) / view.scale;
      focusWorldY = (y - view.y) / view.scale;
      targetZoom = zoom;
      gesture = {
        count: 2, x, y, zoom,
        distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y))
      };
      tapAllowed = false;
    } else if (points.length) {
      gesture = { count: 1, x: points[0].x, y: points[0].y, viewX: view.x, viewY: view.y, dragging: false };
      lastMotionAt = points[0].time;
    } else {
      gesture = null;
    }
  }

  function pointerDown(event) {
    if (destroyed || !canInteract() || event.button !== 0 || pointers.has(event.pointerId)) return;
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * view.width / (bounds.width || view.width);
    const y = (event.clientY - bounds.top) * view.height / (bounds.height || view.height);
    if (!pointers.size) {
      const settledZoom = Math.max(1, Math.min(maxZoom, zoom));
      const sizeX = sceneWidth * view.scale, sizeY = sceneHeight * view.scale;
      const minX = Math.min(0, view.width - sizeX), maxX = Math.max(0, view.width - sizeX);
      const minY = Math.min(0, view.height - sizeY), maxY = Math.max(0, view.height - sizeY);
      const withinEdges = view.x >= minX - .1 && view.x <= maxX + .1 && view.y >= minY - .1 && view.y <= maxY + .1;
      tapAllowed = withinEdges && Math.hypot(velocityX, velocityY) < 8 &&
        Math.abs(zoom - settledZoom) < .001 && Math.abs(targetZoom - zoom) < .001;
      targetZoom = zoom;
    }
    wheelTimeLeft = 0;
    pointers.set(event.pointerId, { x, y, time: event.timeStamp });
    rebaseGesture();
    canvas.setPointerCapture(event.pointerId);
    onInteraction();
  }

  function pointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    if (!canInteract()) { cancel(); return; }
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * view.width / (bounds.width || view.width);
    const y = (event.clientY - bounds.top) * view.height / (bounds.height || view.height);
    const point = pointers.get(event.pointerId);
    if (point.x === x && point.y === y) return;
    point.x = x;
    point.y = y;
    point.time = event.timeStamp;
    const previousX = view.x, previousY = view.y, previousScale = view.scale;
    const points = Array.from(pointers.values());
    if (gesture.count === 2 && points.length > 1) {
      focusX = (points[0].x + points[1].x) / 2;
      focusY = (points[0].y + points[1].y) / 2;
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const requested = gesture.zoom * distance / gesture.distance;
      const bound = Math.max(1, Math.min(maxZoom, requested));
      const excess = requested - bound;
      targetZoom = bound + excess / (1 + Math.abs(excess) / (bound * .12));
      velocityX = velocityY = 0;
    } else {
      const dx = x - gesture.x, dy = y - gesture.y;
      if (Math.hypot(dx, dy) > Math.max(4, 12 * view.width / 1080)) {
        if (!gesture.dragging) {
          gesture.viewX = view.x;
          gesture.viewY = view.y;
          targetZoom = zoom;
        }
        gesture.dragging = true;
        tapAllowed = false;
      }
      if (!gesture.dragging) return;
      view.x = gesture.viewX + dx;
      view.y = gesture.viewY + dy;
      constrain(true);
      const elapsed = event.timeStamp - lastMotionAt;
      if (elapsed > 0) {
        const seconds = Math.max(8, elapsed) / 1000;
        const weight = 1 - Math.exp(-elapsed / 40);
        velocityX += ((view.x - previousX) / seconds - velocityX) * weight;
        velocityY += ((view.y - previousY) / seconds - velocityY) * weight;
        const speedLimit = Math.max(view.width, view.height) * 4;
        velocityX = Math.max(-speedLimit, Math.min(speedLimit, velocityX));
        velocityY = Math.max(-speedLimit, Math.min(speedLimit, velocityY));
      }
    }
    lastMotionAt = event.timeStamp;
    dirty = dirty || previousX !== view.x || previousY !== view.y || previousScale !== view.scale;
    onInteraction();
  }

  function pointerUp(event) {
    if (!pointers.has(event.pointerId)) return;
    if (!canInteract()) { cancel(); return; }
    pointerMove(event);
    const point = pointers.get(event.pointerId);
    const shouldTap = tapAllowed && pointers.size === 1;
    if (event.timeStamp - lastMotionAt > 120) velocityX = velocityY = 0;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (pointers.size < 2) {
      targetZoom = Math.max(1, Math.min(maxZoom, targetZoom));
      focusWorldX = (focusX - view.x) / view.scale;
      focusWorldY = (focusY - view.y) / view.scale;
    }
    if (pointers.size) rebaseGesture();
    else gesture = null;
    tapAllowed = false;
    if (shouldTap) onTap(point.x, point.y);
  }

  function pointerCancel(event) {
    if (pointers.has(event.pointerId)) cancel();
  }

  function wheel(event) {
    if (destroyed || !canInteract()) return;
    event.preventDefault();
    if (pointers.size || !event.deltaY) return;
    const bounds = canvas.getBoundingClientRect();
    focusX = (event.clientX - bounds.left) * view.width / (bounds.width || view.width);
    focusY = (event.clientY - bounds.top) * view.height / (bounds.height || view.height);
    focusWorldX = (focusX - view.x) / view.scale;
    focusWorldY = (focusY - view.y) / view.scale;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height : 1;
    const steps = Math.max(-4, Math.min(4, event.deltaY * unit / 100));
    const requested = targetZoom * Math.pow(1.12, -steps);
    const bound = Math.max(1, Math.min(maxZoom, requested));
    const excess = requested - bound;
    targetZoom = bound + excess / (1 + Math.abs(excess) / (bound * .12));
    // A wheel burst has no pointerup. Allow brief elastic travel, then settle its target.
    wheelTimeLeft = 120;
    velocityX = velocityY = 0;
    dirty = true;
    onInteraction();
  }

  function reset() {
    cancel();
    zoom = targetZoom = 1;
    view.scale = fit;
    view.x = (view.width - sceneWidth * fit) / 2;
    view.y = (view.height - sceneHeight * fit) / 2;
    focusX = view.width / 2;
    focusY = view.height / 2;
    focusWorldX = sceneWidth / 2;
    focusWorldY = sceneHeight / 2;
    dirty = true;
  }

  function resize(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    cancel();
    if (width === view.width && height === view.height) return;
    const worldX = (view.width / 2 - view.x) / view.scale;
    const worldY = (view.height / 2 - view.y) / view.scale;
    view.width = width;
    view.height = height;
    fit = Math.max(width / sceneWidth, height / sceneHeight);
    view.scale = fit * zoom;
    view.x = width / 2 - worldX * view.scale;
    view.y = height / 2 - worldY * view.scale;
    focusX = width / 2;
    focusY = height / 2;
    constrain(false);
    focusWorldX = (focusX - view.x) / view.scale;
    focusWorldY = (focusY - view.y) / view.scale;
    dirty = true;
  }

  function setScene(width, height, maximumZoom = 2) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError("Camera scene dimensions must be positive finite numbers.");
    }
    cancel();
    sceneWidth = width;
    sceneHeight = height;
    maxZoom = Number.isFinite(maximumZoom) ? Math.max(1, maximumZoom) : 2;
    fit = Math.max(view.width / width, view.height / height);
    reset();
  }

  function update(deltaMs) {
    if (destroyed) return false;
    if (!canInteract()) cancel();
    const previousX = view.x, previousY = view.y, previousScale = view.scale;
    const seconds = Number.isFinite(deltaMs) ? Math.max(0, Math.min(100, deltaMs)) / 1000 : 0;
    if (seconds > 0) {
      const spring = 1 - Math.exp(-14 * seconds);
      if (wheelTimeLeft > 0) {
        wheelTimeLeft = Math.max(0, wheelTimeLeft - seconds * 1000);
        if (!wheelTimeLeft) targetZoom = Math.max(1, Math.min(maxZoom, targetZoom));
      }
      zoom += (targetZoom - zoom) * spring;
      if (Math.abs(zoom - targetZoom) < .0001) zoom = targetZoom;
      view.scale = fit * zoom;
      const pinching = gesture && gesture.count === 2;
      const scaled = view.scale !== previousScale;
      if (pinching || scaled) {
        view.x = focusX - focusWorldX * view.scale;
        view.y = focusY - focusWorldY * view.scale;
      }

      if (pointers.size) {
        if (pinching || scaled) constrain(true);
      } else {
        const decay = Math.exp(-4 * seconds);
        view.x += velocityX * (1 - decay) / 4;
        view.y += velocityY * (1 - decay) / 4;
        velocityX *= decay;
        velocityY *= decay;
        if (Math.abs(velocityX) < 2) velocityX = 0;
        if (Math.abs(velocityY) < 2) velocityY = 0;
        const candidateX = view.x, candidateY = view.y;
        constrain(false);
        const boundX = view.x, boundY = view.y;
        const excessX = Math.max(-view.width * .12, Math.min(view.width * .12, candidateX - boundX));
        const excessY = Math.max(-view.height * .12, Math.min(view.height * .12, candidateY - boundY));
        view.x = boundX + excessX * (1 - spring);
        view.y = boundY + excessY * (1 - spring);
        if (Math.abs(view.x - boundX) < .1) view.x = boundX;
        if (Math.abs(view.y - boundY) < .1) view.y = boundY;
        if (velocityX * excessX > 0) velocityX = 0;
        if (velocityY * excessY > 0) velocityY = 0;
      }
    }
    const changed = dirty || previousX !== view.x || previousY !== view.y || previousScale !== view.scale;
    dirty = false;
    return changed;
  }

  const handlers = {
    pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp,
    pointercancel: pointerCancel, lostpointercapture: pointerCancel, wheel
  };
  for (const [type, handler] of Object.entries(handlers)) canvas.addEventListener(type, handler, { passive: false });

  function destroy() {
    cancel();
    destroyed = true;
    for (const [type, handler] of Object.entries(handlers)) canvas.removeEventListener(type, handler);
  }

  return { view, resize, setScene, update, cancel, reset, destroy };
}
