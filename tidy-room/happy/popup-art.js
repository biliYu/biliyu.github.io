const atlas = new URL('./ui-assets/reference-popup/atlas.png', import.meta.url).href;
const ns = 'http://www.w3.org/2000/svg';
let artId = 0;

// All rectangles refer to the approved 896 × 1200 reference, without resampling it.
export function popupArt(rect, className = '', { clip, ink = false, imageUrl = atlas, imageWidth = 896, imageHeight = 1200 } = {}) {
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', rect.join(' '));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('reference-art');
  if (className) svg.classList.add(className);
  const image = document.createElementNS(ns, 'image');
  image.setAttribute('href', imageUrl);
  image.setAttribute('width', imageWidth);
  image.setAttribute('height', imageHeight);
  if (clip || ink) {
    const defs = document.createElementNS(ns, 'defs');
    const id = 'popup-art-' + artId++;
    if (clip) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', clip);
      path.setAttribute('transform', `translate(${rect[0]} ${rect[1]})`);
      const clipping = document.createElementNS(ns, 'clipPath');
      clipping.id = id;
      clipping.append(path);
      defs.append(clipping);
      image.setAttribute('clip-path', `url(#${id})`);
    } else {
      const filter = document.createElementNS(ns, 'filter');
      filter.id = id;
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const matrix = document.createElementNS(ns, 'feColorMatrix');
      matrix.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 -10 0 0 8.7');
      filter.append(matrix);
      defs.append(filter);
      image.setAttribute('filter', `url(#${id})`);
    }
    svg.append(defs);
  }
  svg.append(image);
  return svg;
}

export function popupTexture(rect, className) {
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('reference-art', className);
  svg.setAttribute('aria-hidden', 'true');
  const pattern = document.createElementNS(ns, 'pattern');
  pattern.id = 'popup-texture-' + artId++;
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', rect[2]);
  pattern.setAttribute('height', rect[3]);
  pattern.setAttribute('viewBox', rect.join(' '));
  const image = document.createElementNS(ns, 'image');
  image.setAttribute('href', atlas);
  image.setAttribute('width', '896');
  image.setAttribute('height', '1200');
  pattern.append(image);
  const defs = document.createElementNS(ns, 'defs');
  defs.append(pattern);
  const fill = document.createElementNS(ns, 'rect');
  fill.setAttribute('width', '100%');
  fill.setAttribute('height', '100%');
  fill.setAttribute('fill', `url(#${pattern.id})`);
  svg.append(defs, fill);
  return svg;
}

export function applyPopupArt(popup, variant) {
  const panel = popup.querySelector('.popup-panel');
  panel.querySelectorAll(':scope > .reference-paper').forEach(node => node.remove());
  popup.classList.toggle('reference-popup', Boolean(variant));
  if (!variant) {
    popup.querySelector('#popup-close').replaceChildren();
    return;
  }

  const paper = document.createElement('div');
  paper.className = 'reference-paper';
  paper.setAttribute('aria-hidden', 'true');
  const parts = [
    [24,84,32,32], [70,84,32,32], [398,84,32,32],
    [24,160,32,64], [62,190,36,145], [398,160,32,64],
    [24,466,32,32], [60,466,8,32], [398,466,32,32]
  ];
  parts.forEach((rect, index) => paper.append(index === 4 ? popupTexture([80,260,32,32], 'paper-4') : popupArt(rect, 'paper-' + index)));
  panel.prepend(paper);

  const title = popup.querySelector('h2');
  const titles = {
    '关卡失败': [145,104,164,57], '放弃本局？': [583,144,191,58],
    '等待格已满': [135,683,190,58], '体力不足': [599,652,162,57]
  };
  const titleRect = titles[title.textContent];
  title.classList.toggle('reference-label', Boolean(titleRect));
  if (titleRect) {
    title.style.setProperty('--label-width', titleRect[2]);
    title.style.setProperty('--label-height', titleRect[3]);
    title.append(popupArt(titleRect));
  }

  const actions = popup.querySelector('#popup-actions');
  const chinese = popup.lang === 'zh-Hans';
  const skins = chinese ? {
    failure: [[108,396,238,73]],
    'life-loss': title.textContent.startsWith('放弃') ? [[496,355,178,74],[683,355,179,74]] : [],
    revive: [[47,993,178,82],[234,993,179,82]],
    lives: [[561,836,239,83],[561,929,239,83]]
  }[variant] : null;
  Array.from(actions.children).forEach((button, index) => {
    if (skins?.[index]) {
      button.classList.add('reference-button');
      button.append(popupArt(skins[index]));
    } else {
      // Text-free end caps and a one-pixel centre retain the original bevel.
      const skin = document.createElement('span');
      skin.className = 'reference-button-skin';
      const blue = (variant === 'settings' && index === 1) || (variant === 'lives' && index === 0) || (variant === 'revive' && index === 1);
      const red = variant === 'life-loss' && index === actions.childElementCount - 1;
      const rects = blue ? [[234,993,30,82],[265,993,1,82],[383,993,30,82]] :
        red ? [[683,355,25,74],[708,355,1,74],[837,355,25,74]] :
        [[108,396,52,73],[161,396,1,73],[302,396,44,73]];
      skin.style.gridTemplateColumns = `calc(${rects[0][2]} * var(--p)) minmax(0,1fr) calc(${rects[2][2]} * var(--p))`;
      button.classList.add(blue ? 'reference-blue' : red ? 'reference-red' : 'reference-green');
      rects.forEach(rect => skin.append(popupArt(rect)));
      button.prepend(skin);
    }
  });
  const close = popup.querySelector('#popup-close');
  close.replaceChildren(popupArt([378,665,52,56]));

  if (!chinese) return;
  if (variant === 'failure') {
    const heart = popup.querySelector('.outcome-heart');
    heart.classList.add('reference-label');
    heart.querySelector('img').hidden = true;
    heart.append(popupArt(heart.querySelector('strong') ? [144,217,164,129] : [627,214,104,87], '', {
      clip: heart.querySelector('strong') ? 'M80 10 C49 -9 4 3 2 48 C0 84 31 111 82 129 C132 111 164 84 164 47 C164 5 121 -10 95 8 L84 29 Z' : 'M52 8 C33 -5 2 4 1 32 C1 57 22 76 52 87 C84 76 104 55 104 31 C103 3 73 -5 57 7 L53 22 Z'
    }));
    const reason = popup.querySelector('.outcome-copy');
    reason.classList.add('reference-label');
    reason.append(popupArt([175,356,109,27], '', {ink:true}));
    const level = popup.querySelector('.outcome-level');
    if (level.textContent === '第 1 关') {
      level.classList.add('reference-label');
      level.append(popupArt([187,172,79,35]));
    }
  } else if (variant === 'life-loss') {
    const icon = popup.querySelector('.life-loss-icon');
    icon.replaceWith(popupArt([627,214,105,88], 'life-loss-icon', {clip:'M52 8 C33 -5 2 4 1 32 C1 57 22 76 52 87 C84 76 104 55 104 31 C103 3 73 -5 57 7 L53 22 Z'}));
    const copy = popup.querySelector('.outcome-copy');
    copy.classList.add('reference-label');
    copy.append(popupArt([586,316,183,24], '', {ink:true}));
  } else if (variant === 'revive') {
    popup.querySelector('.revive-balance img').replaceWith(popupArt([45,629,22,23], 'reference-balance-coin'));
    const copy = popup.querySelector('.revive-description');
    copy.classList.add('reference-label');
    copy.append(popupArt([62,953,329,27], '', {ink:true}));
    const stage = popup.querySelector('.revive-stage');
    stage.prepend(popupTexture([125,772,30,24], 'reference-stage-paper'));
    stage.append(popupArt([221,799,78,46], 'reference-arrow', {ink:true}));
    const storage = stage.querySelector('.revive-storage');
    const illustrations = [
      [[113,865,38,28], 'M3 16 Q10 8 25 3 Q32 3 35 7 Q38 12 31 17 Q18 25 7 24 Q1 24 2 18 Z'],
      [[154,864,37,31], 'M2 15 L11 4 L23 1 L34 10 L36 18 L25 28 L5 25 Z'],
      [[200,861,32,38], 'M8 1 L29 7 L26 24 L30 30 L20 36 L14 29 L11 35 L2 31 L7 15 Z'],
      [[243,861,33,39], 'M8 2 L26 4 L31 15 L31 35 L5 36 L1 24 L4 10 Z']
    ];
    for (const [rect, clip] of illustrations) {
      const illustration = popupArt(rect, 'reference-preview-item', {clip});
      illustration.dataset.width = rect[2];
      illustration.dataset.height = rect[3];
      stage.insertBefore(illustration, storage);
    }
    storage.classList.add('reference-storage');
    storage.replaceChildren(
      popupArt([300,834,92,84], 'reference-storage-body', {clip:'M1 15 Q9 1 46 2 Q84 1 91 14 L90 26 L87 33 L86 68 Q85 82 69 84 L24 84 Q7 83 6 68 L5 34 L2 27 Z'}),
      popupArt([302,801,88,35], 'reference-storage-lid', {clip:'M0 23 Q5 1 18 1 L70 1 Q81 4 87 22 L87 30 Q80 35 67 35 L18 35 Q4 34 0 29 Z'})
    );
    stage.append(popupArt([52,823,55,76], 'reference-broom', {clip:'M13 1 Q18 -1 21 3 L22 9 L26 26 L27 29 L31 34 L53 62 Q55 65 50 69 Q30 80 9 72 L2 69 Q-1 66 2 61 L18 32 L16 30 L15 25 L10 8 Q9 3 13 1 Z'}));
  } else if (variant === 'lives') {
    const meter = popup.querySelector('.lives-meter');
    meter.querySelector('img').replaceWith(popupArt([613,731,55,46], 'reference-life-icon', {clip:'M27 6 C14 -5 0 0 0 16 C0 30 14 40 27 46 C42 40 55 29 55 16 C55 -1 38 -5 28 5 Z'}));
    meter.append(popupArt([595,718,170,73], 'reference-counter'));
  }
}
