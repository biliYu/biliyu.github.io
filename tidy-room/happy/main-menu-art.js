const ns = 'http://www.w3.org/2000/svg';
const atlas = new URL('./ui-assets/main-menu/reference-v3.png', import.meta.url).href;
const illustration = new URL('./ui-assets/main-menu/eye-level-messy-room-v3.png', import.meta.url).href;

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

function clipArt(art, id, shapes) {
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${shapes}</clipPath>`;
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('clip-path', `url(#${id})`);
  group.append(...Array.from(art.childNodes));
  art.append(defs, group);
  return art;
}

export function setupMainMenuArt(menu) {
  // Keep the illustration separate from the existing UI; crop it uniformly to the menu frame.
  const background = slice([0,0,768,1376], 'menu-reference-bg');
  background.querySelector('image').setAttribute('href', illustration);
  background.querySelector('image').setAttribute('preserveAspectRatio', 'xMidYMid slice');
  menu.prepend(background);

  const logo = slice([200,150,370,180]);
  const letters = [
    'M280 158 Q271 158 271 167 V174 Q271 182 289 181 V224 Q289 236 300 236 H309 Q320 236 320 224 V181 H327 Q336 181 336 171 V167 Q336 157 326 158 Z',
    'M344 157 Q334 157 334 168 V226 Q334 237 346 237 H355 Q364 237 364 226 V168 Q364 157 354 157 Z',
    'M375 157 Q367 157 367 167 V226 Q367 237 378 237 H396 Q435 236 435 197 Q435 158 396 157 Z M390 183 H395 Q405 184 405 197 Q405 210 395 210 H390 Z',
    'M440 157 Q429 157 429 168 L449 205 V226 Q449 236 459 237 H468 Q479 237 479 226 V205 L495 174 Q501 159 488 157 H482 Q476 157 472 165 L464 183 L456 164 Q452 157 445 157 Z',
    'M225 238 Q216 239 216 250 V314 Q216 326 230 327 H240 Q250 327 250 316 V296 L263 317 Q272 330 287 322 Q296 317 287 304 L275 286 Q291 279 291 262 Q291 237 256 237 Z M249 263 H253 Q257 263 257 267 Q257 271 252 271 H249 Z',
    'M287 282 A45 45 0 1 0 377 282 A45 45 0 1 0 287 282 Z M318 280 A12 17 0 1 0 342 280 A12 17 0 1 0 318 280 Z',
    'M372 282 A45 45 0 1 0 462 282 A45 45 0 1 0 372 282 Z M404 281 A12 16 0 1 0 428 281 A12 16 0 1 0 404 281 Z',
    'M460 251 Q460 240 475 239 Q489 237 496 248 L506 270 L518 246 Q525 237 537 240 Q548 240 549 253 L550 316 Q550 327 542 328 H533 Q522 328 520 316 L518 286 L512 303 Q506 311 499 307 Q493 307 489 300 L481 282 L483 316 Q484 327 472 328 H466 Q457 326 458 315 Z'
  ];
  clipArt(logo, 'menu-logo-cutout', letters.map(d=>`<path d="${d}" clip-rule="evenodd"/>`).join(''));
  // Remove the old blue window fringe while retaining the logo's cream/green/brown artwork.
  logo.querySelector('defs').insertAdjacentHTML('beforeend', '<filter id="menu-logo-matte" color-interpolation-filters="sRGB"><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 20 -20 0 0"/></filter>');
  logo.querySelector('g').setAttribute('filter', 'url(#menu-logo-matte)');
  menu.querySelector('.menu-logo').append(logo);

  const lives = slice([132,29,244,98]);
  lives.append(
    patch([156,47,5,43],[161,47,34,43],'menu-heart-erase'),
    patch([229,48,7,46],[230,48,117,46],'menu-time-erase')
  );
  clipArt(lives, 'menu-lives-cutout', '<rect x="171" y="35" width="202" height="74" rx="37"/><path d="M175 40 C154 24 134 37 134 63 C134 89 155 108 175 115 C196 105 216 86 216 62 C216 36 196 25 177 40 Z"/><circle cx="192" cy="100" r="20"/>');
  menu.querySelector('#menu-lives').prepend(lives);
  const coins = slice([386,28,251,100]);
  coins.append(patch([473,48,9,47],[483,48,124,47],'menu-coins-erase'));
  clipArt(coins, 'menu-coins-cutout', '<rect x="425" y="35" width="209" height="74" rx="37"/><circle cx="426" cy="72" r="39"/><circle cx="447" cy="100" r="20"/>');
  menu.querySelector('#menu-coins').prepend(coins);
  const play = slice([174,1060,421,143]);
  play.append(patch([279,1090,8,79],[264,1090,251,79],'menu-level-erase'));
  // Trace the painted button edge so the old room background stays transparent.
  const playOutline = [
    "M293.85 1063.5 L223.85 1064.5 L218.85 1065.5 L209.85 1068.5 L200.85 1073.5 L196.85 1076.5 L187.85 1085.5 L187.85 1086.5 L183.85 1091.5 L183.85 1092.5 L180.85 1097.5 L180.85 1099.5 L178.85",
    "1102.5 L178.85 1105.5 L177.85 1106.5 L177.85 1109.5 L176.85 1110.5 L176.85 1145.5 L177.85 1146.5 L177.85 1150.5 L178.85 1151.5 L179.85 1156.5 L180.85 1157.5 L180.85 1159.5 L181.85 1160.5",
    "L181.85 1162.5 L182.85 1163.5 L182.85 1164.5 L186.85 1168.5 L186.85 1169.5 L191.85 1174.5 L191.85 1175.5 L199.85 1182.5 L210.85 1188.5 L219.85 1191.5 L225.85 1192.5 L543.15 1192.5 L555.15",
    "1189.5 L565.15 1184.5 L571.15 1179.5 L573.15 1178.5 L581.15 1169.5 L581.15 1168.5 L584.15 1165.5 L585.15 1162.5 L587.15 1160.5 L587.15 1159.5 L588.15 1158.5 L588.15 1155.5 L589.15 1154.5",
    "L589.15 1151.5 L590.15 1150.5 L590.15 1146.5 L591.15 1145.5 L591.15 1133.5 L592.15 1132.5 L592.15 1120.5 L591.15 1119.5 L591.15 1110.5 L590.15 1109.5 L590.15 1106.5 L589.15 1105.5 L589.15",
    "1102.5 L588.15 1101.5 L588.15 1099.5 L587.15 1098.5 L584.15 1091.5 L582.15 1089.5 L582.15 1088.5 L578.15 1084.5 L578.15 1083.5 L571.15 1076.5 L565.15 1072.5 L555.15 1067.5 L543.15 1064.5",
    "L301.15 1063.5 Z"
  ].join(" ");
  clipArt(play, 'menu-play-cutout', `<path d="${playOutline}"/>`);
  menu.querySelector('#menu-play').prepend(play);

  const navigation = Array.from(menu.querySelector('.menu-navigation').children);
  const navShape = '<path d="M0 1277 Q0 1234 43 1234 H725 Q768 1234 768 1277 V1376 H0 Z"/><path d="M99 1221 H173 L179 1229 L187 1253 Q192 1267 188 1274 L180 1280 V1317 Q180 1328 167 1328 H105 Q92 1328 92 1317 L93 1281 L85 1274 Q80 1266 85 1252 L94 1229 Z"/><path d="M343 1221 H367 V1236 L381 1217 Q386 1212 392 1218 L439 1261 Q445 1267 439 1274 L432 1281 V1314 Q432 1326 420 1326 H343 Q330 1326 330 1314 V1281 L325 1275 Q319 1268 327 1261 L343 1245 Z"/><path d="M622 1220 Q634 1217 645 1222 L649 1238 L662 1245 L676 1241 L688 1254 L682 1269 L685 1282 L691 1294 L679 1308 L664 1305 L653 1312 L649 1328 L631 1332 L619 1319 L607 1316 L594 1322 L580 1309 L586 1294 L580 1281 L586 1267 L580 1254 L593 1241 L607 1244 L619 1237 Z"/>';
  navigation.forEach((button,index) => {
    const art = slice([index * 256,1204,256,172]);
    art.append(patch(index === 1 ? [296,1331,12,45] : [8,1331,16,45], [index * 256 + 49,1331,158,45], 'menu-navigation-erase'));
    clipArt(art, 'menu-nav-cutout-' + index, navShape);
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
