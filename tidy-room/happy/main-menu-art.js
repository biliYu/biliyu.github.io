const ns = 'http://www.w3.org/2000/svg';
const atlas = new URL('./ui-assets/main-menu/reference-v3.png', import.meta.url).href;

function slice(rect, className = '') {
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', rect.join(' '));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('menu-slice');
  if (className) svg.classList.add(className);
  const image = document.createElementNS(ns, 'image');
  image.setAttribute('href', atlas);
  image.setAttribute('width', '768');
  image.setAttribute('height', '1376');
  svg.append(image);
  return svg;
}

function patch(source, destination, className) {
  const svg = slice(source, className);
  ['x','y','width','height'].forEach((name,index) => svg.setAttribute(name,destination[index]));
  return svg;
}

function wallPatch(source, destination, right) {
  const art = patch(source, destination, 'menu-corner-wall');
  const id = right ? 'menu-wall-right' : 'menu-wall-left';
  const [x,y,width,height] = source;
  const horizontalStops = right ? '<stop stop-color="white" stop-opacity="0"/><stop offset="12%" stop-color="white"/>' : '<stop offset="88%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/>';
  art.insertAdjacentHTML('afterbegin', `<defs>
    <linearGradient id="${id}-x" gradientUnits="userSpaceOnUse" x1="${x}" x2="${x+width}" y1="${y}" y2="${y}">${horizontalStops}</linearGradient>
    <linearGradient id="${id}-y" gradientUnits="userSpaceOnUse" x1="${x}" x2="${x}" y1="${y}" y2="${y+height}"><stop offset="86%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient>
    <mask id="${id}-vertical" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id}-y)"/></mask>
    <mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id}-x)" mask="url(#${id}-vertical)"/></mask>
  </defs>`);
  art.querySelector('image').setAttribute('mask', `url(#${id})`);
  return art;
}

export function setupMainMenuArt(menu) {
  // The artwork remains at its approved camera and aspect; only its uniform scale changes.
  const background = slice([0,0,768,1376], 'menu-reference-bg');
  // Sample clean wall at each outside edge to remove the two unwanted corner controls.
  background.append(
    wallPatch([0,0,10,155],[0,0,146,155],false),
    wallPatch([758,0,10,155],[622,0,146,155],true)
  );
  menu.prepend(background);

  const lives = slice([132,29,244,98]);
  lives.append(
    patch([156,47,5,43],[161,47,34,43],'menu-heart-erase'),
    patch([229,48,7,46],[230,48,117,46],'menu-time-erase')
  );
  menu.querySelector('#menu-lives').prepend(lives);
  const coins = slice([386,28,251,100]);
  coins.append(patch([473,48,9,47],[483,48,124,47],'menu-coins-erase'));
  menu.querySelector('#menu-coins').prepend(coins);
  const play = slice([174,1060,421,143]);
  play.append(patch([279,1090,8,79],[264,1090,251,79],'menu-level-erase'));
  menu.querySelector('#menu-play').prepend(play);

  const navigation = Array.from(menu.querySelector('.menu-navigation').children);
  navigation.forEach((button,index) => {
    const art = slice([index * 256,1204,256,172]);
    art.append(patch(index === 1 ? [296,1331,12,45] : [8,1331,16,45], [index * 256 + 49,1331,158,45], 'menu-navigation-erase'));
    button.prepend(art);
  });

  const resize = () => {
    const { width, height } = menu.getBoundingClientRect();
    if (!width || !height) return;
    const style = getComputedStyle(menu);
    const left = parseFloat(style.paddingLeft) || 0, right = parseFloat(style.paddingRight) || 0;
    const top = parseFloat(style.paddingTop) || 0, bottom = parseFloat(style.paddingBottom) || 0;
    const availableWidth = width - left - right, availableHeight = height - top - bottom;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    // Keep the full height visible: filling the width can crop the navigation captions.
    const scale = availableWidth / availableHeight <= .62 ? Math.min(availableHeight / 1376, availableWidth / 620) : Math.min(availableWidth / 768, availableHeight / 1376);
    menu.style.setProperty('--mu', scale + 'px');
    menu.style.setProperty('--mx', left + (availableWidth - 768 * scale) / 2 + 'px');
    menu.style.setProperty('--my', top + (availableHeight - 1376 * scale) / 2 + 'px');
  };
  new ResizeObserver(resize).observe(menu);
  resize();
}
