export function createStoragePreview(layer, anchor, onClosed) {
  const host = layer.parentElement;
  const panel = layer.querySelector('.storage-preview-panel');
  const list = layer.querySelector('.storage-preview-items');
  const scroll = layer.querySelector('.storage-preview-scroll');
  const thumb = scroll.firstElementChild;
  const frame = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  frame.classList.add('storage-preview-frame');
  frame.setAttribute('aria-hidden', 'true');
  frame.innerHTML = `<defs>
    <linearGradient id="storage-frame-rim" x2="0" y2="1"><stop stop-color="#ffefce"/><stop offset=".45" stop-color="#f6d69e"/><stop offset="1" stop-color="#e4b67a"/></linearGradient>
    <linearGradient id="storage-frame-face" x2="0" y2="1"><stop stop-color="#fff3d8"/><stop offset=".5" stop-color="#fbe9c7"/><stop offset="1" stop-color="#f5d9ad"/></linearGradient>
    <filter id="storage-frame-soft-shadow" filterUnits="userSpaceOnUse"><feGaussianBlur/></filter>
  </defs>
  <path class="storage-frame-shadow" data-inset="0" filter="url(#storage-frame-soft-shadow)"/>
  <path class="storage-frame-depth" data-inset="0"/>
  <path class="storage-frame-outer" data-inset="0" fill="url(#storage-frame-rim)"/>
  <path class="storage-frame-highlight" data-inset="5"/>
  <path class="storage-frame-face" data-inset="11" fill="url(#storage-frame-face)"/>
  <path class="storage-frame-inner-light" data-inset="14"/>`;
  panel.prepend(frame);
  const paths = Array.from(frame.querySelectorAll('path'));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let animation = null, closing = false, drag = null, gesture = null, blockedClick = false, restoreFocus = false;
  let frameKey = '';

  function updateScroll() {
    const range = list.scrollWidth - list.clientWidth;
    scroll.style.visibility = range > 1 ? 'visible' : 'hidden';
    if (range <= 1) return;
    const width = scroll.clientWidth;
    const size = Math.max(24, width * list.clientWidth / list.scrollWidth);
    thumb.style.width = size + 'px';
    thumb.style.transform = `translateX(${(width - size) * list.scrollLeft / range}px)`;
  }

  function drawFrame(width, height, pointer, unit) {
    const key = [width, height, pointer, unit].join('/');
    if (key === frameKey) return;
    frameKey = key;
    frame.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const path of paths) {
      const inset = Number(path.dataset.inset) * unit;
      const left = inset, top = inset, right = width - inset, bottom = height - inset;
      const radius = 33 * unit - inset;
      const half = 26 * unit - .4 * inset, shoulder = 4 * unit;
      const tip = -24 * unit + 1.4 * inset, round = 3 * unit;
      path.setAttribute('d', `M${left + radius} ${top}
        H${pointer - half - shoulder} Q${pointer - half} ${top} ${pointer - half + shoulder} ${top - shoulder}
        L${pointer - round} ${tip + round} Q${pointer} ${tip} ${pointer + round} ${tip + round}
        L${pointer + half - shoulder} ${top - shoulder} Q${pointer + half} ${top} ${pointer + half + shoulder} ${top}
        H${right - radius} A${radius} ${radius} 0 0 1 ${right} ${top + radius}
        V${bottom - radius} A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}
        H${left + radius} A${radius} ${radius} 0 0 1 ${left} ${bottom - radius}
        V${top + radius} A${radius} ${radius} 0 0 1 ${left + radius} ${top} Z`);
    }
    frame.querySelector('.storage-frame-depth').setAttribute('transform', `translate(0 ${6 * unit})`);
    frame.querySelector('.storage-frame-shadow').setAttribute('transform', `translate(0 ${8 * unit})`);
    const shadow = frame.querySelector('filter');
    for (const [name, value] of Object.entries({ x: -40 * unit, y: -60 * unit, width: width + 80 * unit, height: height + 100 * unit })) shadow.setAttribute(name, value);
    shadow.firstElementChild.setAttribute('stdDeviation', 4 * unit);
  }

  function position() {
    if (layer.hidden) return;
    const bounds = host.getBoundingClientRect(), box = anchor.getBoundingClientRect();
    const row = anchor.parentElement.getBoundingClientRect();
    const unit = Math.max(.32, parseFloat(getComputedStyle(host).getPropertyValue('--u')) || .32);
    // Layout sizes exclude the scale animation, keeping its anchor stationary.
    const style = getComputedStyle(panel);
    const width = parseFloat(style.width), height = parseFloat(style.height);
    const left = Math.max(8, Math.min(bounds.width - width - 8, box.right - bounds.left - width + 12 * unit));
    const top = Math.max(8, Math.min(bounds.height - height - 8, Math.max(box.bottom, row.bottom) - bounds.top + 26 * unit));
    const pointer = Math.max(64 * unit, Math.min(width - 64 * unit, box.left + box.width / 2 - bounds.left - left));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.setProperty('--storage-pointer-x', pointer + 'px');
    drawFrame(width, height, pointer, unit);
    updateScroll();
  }

  function open(icons, emptyText, focus) {
    if (!layer.hidden) return;
    list.replaceChildren();
    for (const icon of icons) {
      const cell = document.createElement('div');
      cell.className = 'storage-preview-item';
      cell.setAttribute('role', 'listitem');
      cell.append(icon);
      list.append(cell);
    }
    if (!icons.length) {
      const empty = document.createElement('p');
      empty.className = 'storage-preview-empty';
      empty.textContent = emptyText;
      list.append(empty);
    }
    restoreFocus = focus;
    closing = blockedClick = false;
    gesture = null;
    layer.hidden = false;
    layer.dataset.phase = 'opening';
    anchor.setAttribute('aria-expanded', 'true');
    list.scrollLeft = 0;
    position();
    if (focus) list.focus({ preventScroll: true });
    if (reducedMotion.matches) { layer.dataset.phase = 'open'; return; }
    const current = panel.animate([
      { transform: 'scale(.16)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 }
    ], { duration: 200, easing: 'cubic-bezier(.18,.8,.25,1)', fill: 'both' });
    animation = current;
    current.finished.then(() => {
      if (animation !== current) return;
      animation = null;
      current.cancel();
      layer.dataset.phase = 'open';
    }).catch(() => {});
  }

  function close(immediate = false) {
    if (layer.hidden || (closing && !immediate)) return;
    const style = getComputedStyle(panel), transform = style.transform, opacity = style.opacity;
    animation?.cancel();
    animation = null;
    closing = true;
    if (drag && list.hasPointerCapture(drag.id)) list.releasePointerCapture(drag.id);
    drag = null;
    layer.dataset.phase = 'closing';
    anchor.setAttribute('aria-expanded', 'false');
    const finish = () => {
      const focus = restoreFocus && layer.contains(document.activeElement);
      layer.hidden = true;
      list.replaceChildren();
      closing = false;
      delete layer.dataset.phase;
      if (focus) anchor.focus({ preventScroll: true });
      onClosed();
    };
    if (immediate || reducedMotion.matches) { finish(); return; }
    const current = panel.animate([
      { transform, opacity }, { transform: 'scale(.16)', opacity: 0 }
    ], { duration: 150, easing: 'cubic-bezier(.4,0,.9,.3)', fill: 'both' });
    animation = current;
    current.finished.then(() => {
      if (animation !== current) return;
      animation = null;
      finish();
      current.cancel();
    }).catch(() => {});
  }

  // A touch tap may omit click after a swipe. Close on release and consume its compatibility click.
  document.addEventListener('pointerdown', event => {
    blockedClick = false;
    if (!event.isPrimary || event.button !== 0) return;
    gesture = layer.hidden ? null : { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }, true);
  document.addEventListener('pointermove', event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
  }, true);
  document.addEventListener('pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    const moved = gesture.moved;
    gesture = null;
    blockedClick = true;
    if (!layer.hidden && moved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!layer.hidden) close();
  }, true);
  document.addEventListener('pointercancel', event => {
    if (gesture?.id !== event.pointerId) return;
    gesture = null;
    blockedClick = true;
  }, true);
  document.addEventListener('click', event => {
    if (blockedClick && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      blockedClick = false;
      return;
    }
    if (layer.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);
  document.addEventListener('keydown', event => {
    if (layer.hidden || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);
  list.addEventListener('pointerdown', event => {
    if (closing || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: list.scrollLeft, moved: false };
    list.setPointerCapture(event.pointerId);
  });
  list.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    list.scrollLeft = drag.left - dx;
  });
  list.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    if (list.hasPointerCapture(event.pointerId)) list.releasePointerCapture(event.pointerId);
  });
  list.addEventListener('pointercancel', event => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
  });
  layer.addEventListener('wheel', event => {
    event.preventDefault();
    if (list.contains(event.target)) {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1;
      list.scrollLeft += (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    }
  }, { passive: false });
  list.addEventListener('scroll', updateScroll);
  const observer = new ResizeObserver(position);
  observer.observe(host);
  observer.observe(anchor);
  return { open, close, position, get active() { return !layer.hidden; } };
}
