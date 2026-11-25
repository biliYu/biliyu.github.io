// Native references: Board.ProbeOf 0x1E488DC, SampleWorld 0x1E490D4,
// Probe.Opaque 0x1E49368, Rules.BlockAt 0x1E36900 in the supplied v0.9 binary.
function roundEven(value) {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor + floor % 2 : Math.round(value);
}

export function makeGeometry(layout, assets, images) {
  const masks = new Map();
  const hulls = new Map();
  for (const item of layout.content) {
    const imageId = item.boardId ?? item.id;
    if (masks.has(imageId)) continue;
    const img = images.get(imageId);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(img, 0, 0);
    const rgba = context.getImageData(0, 0, img.width, img.height).data;
    const alpha = new Uint8Array(img.width * img.height);
    for (let pixel = 0; pixel < alpha.length; pixel++) alpha[pixel] = rgba[pixel * 4 + 3];
    masks.set(imageId, alpha);
    const outline = [];
    for (let y = 0; y < img.height; y++) {
      let left = 0, right = img.width - 1;
      while (left < img.width && alpha[y * img.width + left] <= 40) left++;
      if (left === img.width) continue;
      while (right > left && alpha[y * img.width + right] <= 40) right--;
      outline.push([left, y], [left, y + 1], [right + 1, y], [right + 1, y + 1]);
    }
    outline.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const hull = [];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (const point of outline) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
      hull.push(point);
    }
    const lowerLength = hull.length;
    for (let i = outline.length - 2; i >= 0; i--) {
      while (hull.length > lowerLength && cross(hull[hull.length - 2], hull[hull.length - 1], outline[i]) <= 0) hull.pop();
      hull.push(outline[i]);
    }
    hull.pop();
    hulls.set(imageId, hull);
  }
  const bg = assets[layout.bg];
  return layout.content.map(item => {
    const imageId = item.boardId ?? item.id;
    const sprite = assets[imageId];
    const scale = bg.pixelsPerUnit / sprite.pixelsPerUnit;
    const angle = -item.angle * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    const sx = item.scaleX * scale, sy = item.scaleY * scale;
    const x = bg.imageOriginPx[0] + item.x, y = bg.imageOriginPx[1] - item.y;
    const a = c * sx, b = s * sx, d = c * sy, cc = -s * sy;
    const ox = sprite.imageOriginPx[0], oy = sprite.imageOriginPx[1];
    const tx = x - a * ox - cc * oy, ty = y - b * ox - d * oy;
    const determinant = a * d - b * cc;
    const itemGeometry = {
      width: sprite.width, height: sprite.height,
      a, b, c: cc, d, tx, ty,
      ia: d / determinant, ib: -b / determinant,
      ic: -cc / determinant, id: a / determinant,
      alpha: masks.get(imageId),
      hull: hulls.get(imageId),
      clippedByFurniture: Boolean(item.boardId),
      step: Math.max(1, Math.min(roundEven(Math.max(sprite.textureRect?.width || sprite.width, sprite.textureRect?.height || sprite.height) / 48),
        Math.floor(Math.sqrt(1000 / (4 * Math.abs(sx * sy))))))
    };
    const corners = [[0, 0], [sprite.width, 0], [0, sprite.height], [sprite.width, sprite.height]]
      .map(([u, v]) => [a * u + cc * v + tx, b * u + d * v + ty]);
    itemGeometry.bounds = {
      left: Math.min(...corners.map(p => p[0])), right: Math.max(...corners.map(p => p[0])),
      top: Math.min(...corners.map(p => p[1])), bottom: Math.max(...corners.map(p => p[1]))
    };
    return itemGeometry;
  });
}

export function hitContains(geometry, worldX, worldY) {
  if (worldX < geometry.bounds.left || worldX > geometry.bounds.right ||
      worldY < geometry.bounds.top || worldY > geometry.bounds.bottom) return false;
  if (geometry.clippedByFurniture || geometry.hull.length < 3) return contains(geometry, worldX, worldY);
  const dx = worldX - geometry.tx, dy = worldY - geometry.ty;
  const x = geometry.ia * dx + geometry.ic * dy;
  const y = geometry.ib * dx + geometry.id * dy;
  for (let i = 0; i < geometry.hull.length; i++) {
    const a = geometry.hull[i], b = geometry.hull[(i + 1) % geometry.hull.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -0.0001) return false;
  }
  return true;
}

export function contains(geometry, worldX, worldY) {
  const dx = worldX - geometry.tx, dy = worldY - geometry.ty;
  const x = geometry.ia * dx + geometry.ic * dy;
  const y = geometry.ib * dx + geometry.id * dy;
  if (x < 0 || y < 0 || x >= geometry.width || y >= geometry.height) return false;
  return geometry.alpha[Math.floor(y) * geometry.width + Math.floor(x)] > 40;
}

export async function computeBlockers(geometry) {
  const blockers = geometry.map(() => []);
  for (let i = 0; i < geometry.length; i++) {
    const bottom = geometry[i];
    const samples = [];
    for (let bottomY = bottom.step / 2; bottomY < bottom.height; bottomY += bottom.step) {
      const y = bottom.height - bottomY;
      const row = bottom.height - 1 - Math.trunc(bottomY);
      for (let x = bottom.step / 2; x < bottom.width; x += bottom.step) {
        if (bottom.alpha[row * bottom.width + Math.trunc(x)] <= 40) continue;
        samples.push([bottom.a * x + bottom.c * y + bottom.tx, bottom.b * x + bottom.d * y + bottom.ty]);
      }
    }
    const required = Math.max(1, Math.fround(samples.length * Math.fround(0.01)) - 0.0001);
    for (let j = i + 1; j < geometry.length; j++) {
      const top = geometry[j];
      if (top.bounds.left >= bottom.bounds.right || top.bounds.right <= bottom.bounds.left ||
          top.bounds.top >= bottom.bounds.bottom || top.bounds.bottom <= bottom.bounds.top) continue;
      let covered = 0;
      for (const [x, y] of samples) {
        if (contains(top, x, y) && ++covered >= required) {
          blockers[i].push(j);
          break;
        }
      }
    }
    if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return blockers;
}

export function drawItem(context, image, transform) {
  context.save();
  context.transform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
  context.drawImage(image, 0, 0);
  context.restore();
}
