import { createSession, pick, advance, clearQueue, vacuum, unlockBox, unlockQueueSlot, revive, prefillTutorial, snapshot, restoreSession, canPick, acceptingBox, MAX_QUEUE_SLOTS } from "./session.js";
import { makeGeometry, computeBlockers, drawItem, hitContains } from "./geometry.js";
import { createCamera } from "./camera.js";
import { createPresentation, paintItem, paintSweptItem, paintSweepingBroom, QUEUE_ITEM_EXTENT } from "./presentation.js";
import { applyPopupArt } from "./popup-art.js";
import { setupMainMenuArt } from "./main-menu-art.js";
import { createStoragePreview } from "./storage-preview.js";

const base = new URL("./", import.meta.url);
const host = document.querySelector("#game");
const canvas = document.querySelector("#board");
const context = canvas.getContext("2d");
const blockedTint = document.createElement("canvas");
const blockedTintContext = blockedTint.getContext("2d");
const blockedTaps = new Map();
const BLOCKED_FEEDBACK_MS = 400;
const effectsCanvas = document.querySelector("#effects");
const mainMenu = document.querySelector("#main-menu");
const menuPlay = document.querySelector("#menu-play");
const menuCoins = document.querySelector("#menu-coins b");
const popup = document.querySelector("#popup");
const popupClose = document.querySelector("#popup-close");
const popupActions = document.querySelector("#popup-actions");
window.addEventListener("keydown", event => { if (event.key === "Tab") { popup.classList.add("keyboard-navigation"); mainMenu.classList.add("keyboard-navigation"); } });
window.addEventListener("pointerdown", () => { popup.classList.remove("keyboard-navigation"); mainMenu.classList.remove("keyboard-navigation"); }, { passive: true });
const reviveBalance = popup.querySelector(".revive-balance");
const loading = document.querySelector("#loading");
const loadingProgress = document.querySelector("#loading-progress");
const loadingPercentage = document.querySelector("#loading-percentage");
const loadingCaption = document.querySelector("#loading-text");
const toastNode = document.querySelector("#toast");
const options = new URLSearchParams(location.search);
const languageTag = (options.get("lang") || document.documentElement.lang || navigator.language || "en").replaceAll("_", "-").toLowerCase();
const storageLanguage = languageTag === "zh" || languageTag.startsWith("zh-") ?
  languageTag.includes("hant") || /^zh-(tw|hk|mo)(-|$)/.test(languageTag) ? "zh-Hant" : "zh-Hans" : "en";
const loadingCopy = {
  en: { loading: "Loading…", preparing: "Preparing room…" },
  "zh-Hans": { loading: "正在加载…", preparing: "正在准备房间…" },
  "zh-Hant": { loading: "正在載入…", preparing: "正在準備房間…" }
}[storageLanguage];
loadingCaption.textContent = loadingCopy.loading;
loadingProgress.setAttribute("aria-label", loadingCopy.loading);
const storageMessages = {
  en: { label: "Storage", description: "Temporary storage", title: "Storage", confirm: "OK", empty: "Storage is empty" },
  "zh-Hans": { label: "暂存", description: "临时仓库", title: "暂存物品", confirm: "确定", empty: "暂存箱里还没有物件" },
  "zh-Hant": { label: "暫存", description: "臨時倉庫", title: "暫存物品", confirm: "確定", empty: "暫存箱裡還沒有物件" }
};
const storageText = storageMessages[storageLanguage];
const REVIVE_COIN_COST = 800;
const HEART_REFILL_COST = 700;
const MAX_HEARTS = 5;
const HEART_RECOVERY_MS = 30 * 60 * 1000;
const coinFormat = new Intl.NumberFormat(storageLanguage);
const menuCoinFormat = new Intl.NumberFormat(storageLanguage, { notation: "compact", maximumFractionDigits: 1 });
const reviveText = {
  en: { title: "Waiting slots full", description: "Sweep the waiting items into storage and keep going.", storage: "Storage",
    watch: "Watch video", free: "Free", coin: "Coin revive", balance: "Coins",
    loading: "Loading video…", unavailable: "Video unavailable. Try again." },
  "zh-Hans": { title: "等待格已满", description: "把等待格里的物件扫进暂存箱，继续整理。", storage: "暂存箱",
    watch: "看视频复活", free: "免费", coin: "金币复活", balance: "金币余额",
    loading: "正在加载视频…", unavailable: "视频暂时无法播放，请重试。" },
  "zh-Hant": { title: "等待格已滿", description: "把等待格裡的物件掃進暫存箱，繼續整理。", storage: "暫存箱",
    watch: "看影片復活", free: "免費", coin: "金幣復活", balance: "金幣餘額",
    loading: "正在載入影片…", unavailable: "影片暫時無法播放，請重試。" }
}[storageLanguage];
const menuText = {
  en: { home: "Home", back: "Back to home", shop: "Shop", full: "Full", level: value => "Level " + value,
    records: "My progress", currentLevel: "Current level", orders: "Completed orders", picked: "Collected items" },
  "zh-Hans": { home: "主页", back: "返回主页", shop: "商店", full: "已满", level: value => "第" + value + "关",
    records: "整理记录", currentLevel: "当前关卡", orders: "已完成订单", picked: "已拾取物件" },
  "zh-Hant": { home: "主頁", back: "返回主頁", shop: "商店", full: "已滿", level: value => "第" + value + "關",
    records: "整理紀錄", currentLevel: "目前關卡", orders: "已完成訂單", picked: "已拾取物件" }
}[storageLanguage];
const victoryText = {
  en: { title: "Room complete!", elapsed: "Time spent tidying", preview: "The room after tidying", next: "Next level", again: "Play again" },
  "zh-Hans": { title: "整理完毕！", elapsed: "本次整理耗时", preview: "整理后的房间", next: "下一关", again: "再玩一次" },
  "zh-Hant": { title: "整理完畢！", elapsed: "本次整理耗時", preview: "整理後的房間", next: "下一關", again: "再玩一次" }
}[storageLanguage];
const flowText = {
  en: {
    close: "Close", settings: "Settings", sound: "Sound", haptic: "Haptic", continue: "Continue", continueGame: "Continue game", retry: "Restart level",
    failure: "Room unfinished", level: number => "Level " + number,
    giveUpTitle: "Give up this room?", giveUp: "Give up", restartTitle: "Restart this room?", loseHeart: "You’ll use 1 life.",
    backToRevive: "Back to revive", shop: "Coin shop", shortfall: value => value + " more coins needed",
    shopUnavailable: "Coin purchases are unavailable in this build.", backToLives: "Back to lives",
    lives: "Life refill", outOfLives: "Out of lives", livesLeft: "Lives remaining", nextLife: "Next life in", full: "Lives full",
    watchForLife: "Watch for 1 life", refill: "Refill lives"
  },
  "zh-Hans": {
    close: "关闭", settings: "设置", sound: "音效", haptic: "振动", continue: "继续", continueGame: "继续游戏", retry: "重新开始",
    failure: "关卡失败", level: number => "第 " + number + " 关",
    giveUpTitle: "放弃本局？", giveUp: "放弃本局", restartTitle: "重新开始？", loseHeart: "本局会消耗 1 点体力。",
    backToRevive: "返回复活", shop: "金币商店", shortfall: value => "还差 " + value + " 金币",
    shopUnavailable: "当前版本暂无可购买的金币。", backToLives: "返回体力补给",
    lives: "体力补给", outOfLives: "体力不足", livesLeft: "剩余体力", nextLife: "下次恢复", full: "体力已满",
    watchForLife: "看视频 +1 体力", refill: "补满体力"
  },
  "zh-Hant": {
    close: "關閉", settings: "設定", sound: "音效", haptic: "震動", continue: "繼續", continueGame: "繼續遊戲", retry: "重新開始",
    failure: "關卡失敗", level: number => "第 " + number + " 關",
    giveUpTitle: "放棄本局？", giveUp: "放棄本局", restartTitle: "重新開始？", loseHeart: "本局會消耗 1 點體力。",
    backToRevive: "返回復活", shop: "金幣商店", shortfall: value => "還差 " + value + " 金幣",
    shopUnavailable: "目前版本暫無可購買的金幣。", backToLives: "返回體力補給",
    lives: "體力補給", outOfLives: "體力不足", livesLeft: "剩餘體力", nextLife: "下次恢復", full: "體力已滿",
    watchForLife: "看影片 +1 體力", refill: "補滿體力"
  }
}[storageLanguage];
const storageButton = document.querySelector("#storage");
storageButton.lang = storageLanguage;
storageButton.setAttribute("aria-label", storageText.description);
storageButton.querySelector("b").textContent = storageText.label;
const editorPreview = options.get("editorPreview");
const development = options.get("dev") === "1" || Boolean(editorPreview);
mainMenu.hidden = development;
mainMenu.lang = storageLanguage;
mainMenu.setAttribute("aria-label", menuText.home);
host.dataset.screen = development ? "game" : "menu";
document.querySelector("#menu-home span").textContent = menuText.home;
document.querySelector("#menu-shop span").textContent = menuText.shop;
document.querySelector("#menu-settings span").textContent = flowText.settings;
document.querySelector("#menu-settings").setAttribute("aria-label", flowText.settings);
setupMainMenuArt(mainMenu);
const saveKey = "happy-tidy.web.v1" + (development ? ".development" : "");
let saved;
try { if (!editorPreview) saved = JSON.parse(localStorage.getItem(saveKey)); } catch {}
let player = {
  level: 1, variant: 0, hearts: MAX_HEARTS, heartAt: Date.now(), heartSpent: false,
  coins: 600, sound: true, haptic: true, vacuum: 0, clear: 0, tutorialClaims: {},
  ...(saved?.version === 1 ? saved.player : {})
};
if (development && options.has("level")) {
  player.level = Math.max(1, Math.trunc(Number(options.get("level"))) || 1);
  player.variant = options.get("variant") === "1" ? 1 : 0;
  saved = null;
}
for (const [key, min, max, fallback] of [
  ["level", 1, 9999, 1], ["variant", 0, 1, 0], ["hearts", 0, MAX_HEARTS, MAX_HEARTS],
  ["coins", 0, 99999999, 600], ["vacuum", 0, 9999, 0], ["clear", 0, 9999, 0]
]) {
  player[key] = Number.isInteger(player[key]) ? Math.min(max, Math.max(min, player[key])) : fallback;
}
for (const key of ["sound", "haptic"]) if (typeof player[key] !== "boolean") player[key] = true;
player.heartSpent = player.heartSpent === true;
if (!Number.isFinite(player.heartAt) || player.heartAt <= 0 || player.heartAt > Date.now()) player.heartAt = Date.now();
player.tutorialClaims = { vacuum: player.tutorialClaims?.vacuum === true, clear: player.tutorialClaims?.clear === true };
let catalog, ui, state, level, geometry, images, background;
let previousFrame = 0, presentationTime = 0;
let presentation, presentationConfig, reviveBroom, revivePreview;
let popupDismiss, livesPanel, discardResume = false;
let rewardedAdPending = false;
let roomLoading = true;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let lastPick = 0, drawnHint = -1, hudSignature = "";
let completionShown = false, toastTimer, loadingGeneration = 0;
const sounds = new Map();
let extras = { audio: [] };
const url = path => new URL(path, base).href;
const picture = (source, alt = "") => {
  const image = document.createElement("img");
  image.src = source;
  image.alt = alt;
  image.draggable = false;
  return image;
};

const camera = createCamera(canvas, {
  onTap: tap,
  onInteraction() {
    lastPick = performance.now();
    if (drawnHint !== -1) { drawnHint = -1; render(); }
  },
  canInteract: () => Boolean(state && !state.paused && state.status === "playing" && !roomLoading && !rewardedAdPending)
});
const viewport = camera.view;
let storagePreviewOwner = null;
const storagePreviewLayer = document.querySelector("#storage-preview");
storagePreviewLayer.lang = storageLanguage;
storagePreviewLayer.setAttribute("aria-label", storageText.title);
storagePreviewLayer.setAttribute("role", "region");
storageButton.setAttribute("aria-controls", storagePreviewLayer.id);
storageButton.setAttribute("aria-expanded", "false");
const storagePreview = createStoragePreview(storagePreviewLayer, storageButton, () => {
  if (storagePreviewOwner === state) {
    state.paused = popup.open || !mainMenu.hidden || roomLoading || rewardedAdPending;
    previousFrame = 0;
    lastPick = performance.now();
  }
  storagePreviewOwner = null;
});

function notify(text) {
  clearTimeout(toastTimer);
  toastNode.textContent = text;
  toastNode.hidden = false;
  toastTimer = setTimeout(() => { toastNode.hidden = true; }, 2300);
}

function persist() {
  if (!state || editorPreview) return;
  try {
    localStorage.setItem(saveKey, JSON.stringify({ version: 1, player, session: discardResume ? null : snapshot(state) }));
  } catch { notify("Storage unavailable. Keep this window open to retain progress."); }
}

function refreshHearts() {
  const now = Date.now();
  if (player.hearts >= MAX_HEARTS) player.heartAt = now;
  else {
    const count = Math.floor((now - player.heartAt) / HEART_RECOVERY_MS);
    if (count > 0) {
      player.hearts = Math.min(MAX_HEARTS, player.hearts + count);
      player.heartAt += count * HEART_RECOVERY_MS;
    }
  }
  document.querySelector("#heart-count").textContent = player.hearts;
  const seconds = Math.max(0, Math.ceil((HEART_RECOVERY_MS - (now - player.heartAt)) / 1000));
  const time = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  const full = player.hearts >= MAX_HEARTS;
  document.querySelector("#heart-time").textContent = full ? "Full" : time;
  document.querySelector("#menu-heart-count").textContent = player.hearts;
  document.querySelector("#menu-heart-time").textContent = full ? menuText.full : time;
  mainMenu.dataset.hearts = player.hearts;
  mainMenu.dataset.full = String(full);
  document.querySelector("#menu-lives").setAttribute("aria-label", flowText.lives + " " + player.hearts + " / " + MAX_HEARTS);
  updateMainMenu();
  if (livesPanel) {
    livesPanel.count.textContent = player.hearts + " / " + MAX_HEARTS;
    livesPanel.count.parentElement.dataset.count = player.hearts;
    livesPanel.timer.textContent = full ? flowText.full : flowText.nextLife + " " + time;
    const canRefill = !full && (!livesPanel.required || !player.hearts);
    livesPanel.watch.hidden = !canRefill || catalog.config.disableAdsRelated;
    livesPanel.refill.hidden = !canRefill;
    if (popupActions.contains(document.activeElement) && document.activeElement.hidden) popupClose.focus();
  }
}

function loadSound(name) {
  let sound = sounds.get(name);
  if (sound) return sound;
  const entry = extras.audio.find(entry => entry.name === name || entry.name?.toLowerCase() === name.toLowerCase());
  if (!entry?.url) return;
  sound = new Audio(url(entry.url));
  sound.volume = .55;
  sounds.set(name, sound);
  return sound;
}

function audio(name) {
  if (!player.sound) return;
  const sound = loadSound(name);
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function showPopup(title, content, actions, dismiss = closePopup, variant = "", dismissLabel = flowText.close) {
  storagePreview.close(true);
  revivePreview = null;
  livesPanel = null;
  popupDismiss = dismiss;
  if (state) state.paused = true;
  camera.cancel();
  blockedTaps.clear();
  render();
  host.classList.add("paused");
  document.querySelector("#popup-title").textContent = title;
  const body = document.querySelector("#popup-content");
  body.textContent = "";
  if (typeof content === "string") body.textContent = content;
  else if (content) body.append(content);
  popupActions.textContent = "";
  for (const [label, action] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.autofocus = Boolean(variant) && popupActions.childElementCount === 0;
    button.textContent = label;
    button.addEventListener("click", action);
    popupActions.append(button);
  }
  popupActions.classList.toggle("two-actions", Boolean(variant) && variant !== "lives" && actions.length === 2);
  popup.dataset.variant = variant;
  popup.classList.toggle("room-popup", Boolean(variant));
  popup.lang = variant ? storageLanguage : "";
  reviveBalance.hidden = variant !== "revive";
  popupClose.hidden = !dismiss;
  popupClose.setAttribute("aria-label", dismissLabel);
  popupClose.title = dismissLabel;
  applyPopupArt(popup, variant);
  // Swapping views inside the open dialog must also move focus away from the removed buttons.
  if (popup.open) (popupActions.firstElementChild ?? popupClose).focus();
  else popup.showModal();
}

function closePopup() {
  revivePreview = null;
  livesPanel = null;
  popupDismiss = null;
  popup.close();
  if (state) state.paused = !mainMenu.hidden;
  host.classList.remove("paused");
  previousFrame = 0;
  lastPick = performance.now();
  queueMicrotask(offerBoosterTutorial);
}

function updateMainMenu() {
  const nextLevel = state?.status === "won" ? player.level + 1 : player.level;
  menuCoins.textContent = player.coins < 10000 ? coinFormat.format(player.coins) : menuCoinFormat.format(player.coins);
  document.querySelector("#menu-coins").setAttribute("aria-label", reviveText.balance + " " + coinFormat.format(player.coins));
  menuPlay.querySelector("strong").textContent = menuText.level(nextLevel);
  mainMenu.dataset.coins = player.coins;
  mainMenu.dataset.level = nextLevel;
}

function showMainMenu() {
  if (!state || roomLoading) return;
  if (popup.open) closePopup();
  mainMenu.hidden = false;
  storagePreview.close(true);
  host.dataset.screen = "menu";
  state.paused = true;
  camera.cancel();
  blockedTaps.clear();
  previousFrame = 0;
  refreshHearts();
  persist();
  menuPlay.focus({ preventScroll: true });
}

function playRoomHudIntro() {
  host.classList.remove("room-ui-entering");
  void host.offsetWidth;
  host.classList.add("room-ui-entering");
}

function enterRoom() {
  if (!state || roomLoading) return;
  refreshHearts();
  if (!development && catalog.config.heartsEnabled && !player.heartSpent && !player.hearts) {
    showLivesPopup(true, closePopup, enterRoom);
    return;
  }
  if (popup.open) closePopup();
  if (state.status !== "playing") {
    const nextLevel = state.status === "won" ? player.level + 1 : player.level;
    start(nextLevel, null, { enterGame: true });
    return;
  }
  mainMenu.hidden = true;
  host.dataset.screen = "game";
  state.paused = false;
  previousFrame = 0;
  lastPick = performance.now();
  presentation.reset();
  resize();
  playRoomHudIntro();
  persist();
  offerBoosterTutorial();
}

function showMenuRecords() {
  if (!state || roomLoading) return;
  const body = document.createElement("dl");
  body.className = "menu-record-list";
  const records = [
    [menuText.currentLevel, menuText.level(player.level)],
    [menuText.orders, state.completedOrders + " / " + level.order.length],
    [menuText.picked, state.items.filter(item => item.zone !== "board").length + " / " + state.items.length]
  ];
  for (const [label, value] of records) {
    const name = document.createElement("dt");
    name.textContent = label;
    const amount = document.createElement("dd");
    amount.textContent = value;
    body.append(name, amount);
  }
  showPopup(menuText.records, body, [[menuText.back, closePopup]], closePopup, "records");
}

function showRevivePopup() {
  const body = document.createElement("div");
  const coinIcon = url(ui.get("GP_Icon_Coin_S").url);
  const availableCoins = document.createElement("strong");
  availableCoins.textContent = coinFormat.format(player.coins);
  reviveBalance.replaceChildren(picture(coinIcon, reviveText.balance), availableCoins);
  const stage = document.createElement("div");
  stage.className = "revive-stage";
  stage.setAttribute("aria-hidden", "true");
  const tray = document.createElement("div");
  tray.className = "revive-tray";
  for (let slotIndex = 0; slotIndex < state.queue.length; slotIndex++) {
    const slot = document.createElement("span");
    slot.className = "slot";
    tray.append(slot);
  }
  const storage = document.createElement("div");
  storage.className = "storage-model revive-storage is-open";
  storage.append(storageButton.querySelector("img").cloneNode());
  const label = document.createElement("b");
  label.textContent = reviveText.storage;
  storage.append(label);
  const sprites = document.createElement("canvas");
  stage.append(tray, storage, sprites);
  const description = document.createElement("p");
  description.className = "revive-description";
  description.textContent = reviveText.description;
  const status = document.createElement("p");
  status.className = "revive-status";
  status.setAttribute("role", "status");
  body.append(stage, description, status);

  const continueRoom = cost => {
    if (!popup.open || popup.dataset.variant !== "revive" || state.status !== "lost") return;
    if (player.coins < cost) { showCoinShop(cost, flowText.backToRevive, showRevivePopup); return; }
    state.paused = false;
    if (!revive(state).ok) { state.paused = true; return; }
    player.coins -= cost;
    closePopup();
    completionShown = false;
    audio("Broom booster");
    changed();
  };
  showPopup(reviveText.title, body, [
    [coinFormat.format(REVIVE_COIN_COST), () => continueRoom(REVIVE_COIN_COST)],
    [reviveText.free, () => runRewardedVideo(() => continueRoom(0), status)]
  ], () => {
    if (catalog.config.heartsEnabled && player.heartSpent) confirmLifeLoss(true, () => showFailurePopup(), showRevivePopup);
    else showFailurePopup();
  }, "revive", flowText.giveUp);
  const [coinButton, watchButton] = popupActions.children;
  coinButton.setAttribute("aria-label", reviveText.coin + " " + coinFormat.format(REVIVE_COIN_COST));
  coinButton.prepend(picture(coinIcon));
  watchButton.setAttribute("aria-label", reviveText.watch);
  watchButton.prepend(picture(url("ui-assets/outlined-v2/button-video.svg")));
  revivePreview = { sprites, tray, storage, broom: stage.querySelector('.reference-broom'), icons: Array.from(stage.querySelectorAll('.reference-preview-item')), items: state.queue.map(index => state.items[index]), context: sprites.getContext("2d"), start: performance.now() };
  renderRevivePreview(revivePreview.start);
}

function renderRevivePreview(timestamp) {
  const preview = revivePreview;
  const { sprites, tray, storage, items, context } = preview;
  const frame = sprites.getBoundingClientRect();
  if (!frame.width || !frame.height) return;
  const ratio = Math.min(2, devicePixelRatio);
  if (preview.width !== frame.width || preview.height !== frame.height || preview.ratio !== ratio) {
    preview.width = frame.width; preview.height = frame.height; preview.ratio = ratio;
    sprites.width = Math.round(frame.width * ratio);
    sprites.height = Math.round(frame.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    preview.origins = Array.from(tray.children, slot => {
      const rect = slot.getBoundingClientRect();
      return { x: rect.left - frame.left + rect.width / 2, y: rect.top - frame.top + rect.height / 2,
        size: Math.min(rect.width, rect.height) * .86 };
    });
    const box = storage.getBoundingClientRect();
    preview.mouth = { x: box.left - frame.left + box.width / 2, y: box.top - frame.top + box.height * .32, width: box.width };
  }
  const phase = reducedMotion.matches ? 0 : Math.max(0, timestamp - preview.start) % 2700;
  const progress = Math.min(1, Math.max(0, (phase - 600) / 950));
  const broomSize = frame.width * .19;
  const first = preview.origins[0];
  storage.classList.toggle("is-open", progress < 1);
  context.clearRect(0, 0, frame.width, frame.height);
  if (preview.icons.length) {
    // The approved four-object illustration follows the same contact/arrival timing as the room sweep.
    for (const [index, icon] of preview.icons.entries()) {
      const from = preview.origins[Math.min(index + 1, preview.origins.length - 1)];
      const across = Math.min(1, Math.max(0, (from.x - first.x) / (preview.mouth.x - first.x)));
      const contact = .24 + .53 * across;
      const travel = Math.max(0, (progress - contact) / (.64 + .32 * across - contact));
      const slide = travel * (.72 + .28 * travel);
      const drop = Math.max(0, (travel - .72) / .28);
      const scale = frame.width / 366 * (1 - .43 * Math.min(1, drop) ** 2);
      const width = Number(icon.dataset.width) * scale, height = Number(icon.dataset.height) * scale;
      const x = from.x + (preview.mouth.x - from.x) * slide;
      const y = from.y + (preview.mouth.y - from.y) * slide - Math.sin(Math.PI * travel) * from.size * .59 + from.size * .32 * drop ** 2;
      icon.style.width = width + 'px'; icon.style.height = height + 'px';
      icon.style.transform = `translate(${x - width / 2}px, ${y - height / 2}px)`;
      icon.style.opacity = Math.max(0, Math.min(1, (1 - travel) * 9));
    }
  } else for (const [slot, item] of items.entries()) {
    if (item) paintSweptItem(context, images.get(item.id), item, preview.origins[slot], preview.mouth, progress, first.x);
  }
  if (preview.broom) {
    const stroke = Math.min(1, Math.max(0, (progress - .24) / .53));
    const lift = Math.sin(Math.min(1, progress / .24) * Math.PI);
    const release = Math.max(0, (progress - .77) / .23);
    preview.broom.style.transform = `translate(${(preview.mouth.x - first.x) * stroke}px, ${(preview.mouth.y - first.y) * stroke - frame.height * .12 * lift}px) rotate(${27 * lift - 40 * stroke + 24 * release}deg)`;
    preview.broom.style.opacity = 1 - release ** 2;
  } else paintSweepingBroom(context, reviveBroom, first, preview.mouth, progress, broomSize);
}

function restartCurrentRoom(back) {
  if (roomLoading) return;
  refreshHearts();
  if (!development && catalog.config.heartsEnabled && !player.hearts) {
    showLivesPopup(true, back, () => restartCurrentRoom(back));
    return;
  }
  discardResume = true;
  player.heartSpent = false;
  persist();
  start(player.level);
}

function showFailurePopup(lostLife = catalog.config.heartsEnabled && (player.heartSpent || development)) {
  discardResume = true;
  player.heartSpent = false;
  persist();

  const body = document.createElement("div");
  const levelLabel = document.createElement("p");
  levelLabel.className = "outcome-level";
  levelLabel.textContent = flowText.level(player.level);
  const heart = document.createElement("div");
  heart.className = "outcome-heart";
  heart.append(picture(url(ui.get("GP_Icon_HeartBreak").url)));
  if (lostLife) {
    const amount = document.createElement("strong");
    amount.textContent = "-1";
    heart.append(amount);
  }
  const reason = document.createElement("p");
  reason.className = "outcome-copy";
  reason.textContent = reviveText.title;
  body.append(levelLabel, heart, reason);
  const actions = [[flowText.retry, () => restartCurrentRoom(() => showFailurePopup(lostLife))]];
  showPopup(flowText.failure, body, actions, null, "failure");
}

function showVictoryPopup() {
  const body = document.createElement("div");
  body.className = "victory-content";
  const preview = document.createElement("figure");
  preview.className = "victory-preview";
  preview.append(picture(background.src || background.toDataURL("image/png"), victoryText.preview));
  const caption = document.createElement("p");
  caption.id = "victory-duration-label";
  caption.className = "victory-caption";
  caption.textContent = victoryText.elapsed;
  const seconds = Math.floor(state.now / 1000);
  const duration = document.createElement("time");
  duration.className = "victory-duration";
  duration.dateTime = "PT" + seconds + "S";
  duration.setAttribute("aria-labelledby", caption.id);
  duration.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  body.append(preview, caption, duration);
  showPopup(victoryText.title, body, [[editorPreview ? victoryText.again : victoryText.next, () => {
    if (!popup.open || popup.dataset.variant !== "victory" || state.status !== "won") return;
    closePopup();
    player.heartSpent = false;
    start(editorPreview ? player.level : player.level + 1);
  }]], editorPreview ? null : showMainMenu, "victory", menuText.back);
}

function confirmLifeLoss(givingUp, confirm, cancel) {
  const body = document.createElement("div");
  const heart = picture(url(ui.get("GP_Icon_HeartBreak").url));
  heart.className = "life-loss-icon";
  const warning = document.createElement("p");
  warning.className = "outcome-copy";
  warning.textContent = flowText.loseHeart;
  body.append(heart, warning);
  const back = givingUp ? flowText.backToRevive : flowText.continue;
  showPopup(givingUp ? flowText.giveUpTitle : flowText.restartTitle, body, [
    [back, cancel],
    [givingUp ? flowText.giveUp : flowText.retry, confirm]
  ], cancel, "life-loss", back);
}

function showCoinShop(cost, backLabel, back) {
  const body = document.createElement("div");
  const balance = document.createElement("div");
  balance.className = "shop-balance";
  const coins = document.createElement("strong");
  coins.textContent = coinFormat.format(player.coins);
  balance.append(picture(url(ui.get("GP_Icon_Coin_S").url), reviveText.balance), coins);
  const difference = document.createElement("p");
  difference.className = "outcome-copy";
  difference.textContent = flowText.shortfall(coinFormat.format(cost - player.coins));
  difference.hidden = cost <= player.coins;
  const status = document.createElement("p");
  status.className = "shop-availability";
  status.textContent = flowText.shopUnavailable;
  body.append(balance, difference, status);
  showPopup(flowText.shop, body, [[backLabel, back]], back, "coin-shop", backLabel);
}

function showLivesPopup(required = false, back = closePopup, resume = closePopup) {
  const body = document.createElement("div");
  const count = document.createElement("strong");
  const meter = document.createElement("div");
  meter.className = "lives-meter";
  meter.append(picture(url(ui.get("GP_Icon_Heart").url), flowText.livesLeft), count);
  const timer = document.createElement("p");
  timer.className = "lives-timer";
  const status = document.createElement("p");
  status.className = "revive-status";
  status.setAttribute("role", "status");
  body.append(meter, timer, status);

  const closeLives = () => { back(); persist(); };
  const refill = (cost, amount) => {
    if (!livesPanel) return;
    refreshHearts();
    if (player.hearts >= MAX_HEARTS || (required && player.hearts > 0)) return;
    if (player.coins < cost) {
      showCoinShop(cost, flowText.backToLives, () => showLivesPopup(required, back, resume));
      return;
    }
    player.coins -= cost;
    player.hearts = Math.min(MAX_HEARTS, player.hearts + amount);
    if (player.hearts === MAX_HEARTS) player.heartAt = Date.now();
    refreshHearts();
    resume();
    persist();
  };
  showPopup(required ? flowText.outOfLives : flowText.lives, body, [
    [flowText.watchForLife, () => runRewardedVideo(() => refill(0, 1), status)],
    [flowText.refill, () => refill(HEART_REFILL_COST, MAX_HEARTS)]
  ], closeLives, "lives");
  const [watch, coin] = popupActions.children;
  watch.prepend(picture(url("ui-assets/outlined-v2/button-video.svg")));
  const price = document.createElement("span");
  price.className = "revive-price";
  price.append(picture(url(ui.get("GP_Icon_Coin_S").url)), coinFormat.format(HEART_REFILL_COST));
  coin.append(price);
  livesPanel = { count, timer, watch, refill: coin, required };
  refreshHearts();
}

function checkOutOfLives() {
  if (!mainMenu.hidden || development || !catalog.config.heartsEnabled || player.heartSpent) return false;
  refreshHearts();
  if (player.hearts > 0) return false;
  showLivesPopup(true);
  return true;
}

async function runRewardedVideo(onReward, status) {
  const capacitor = globalThis.Capacitor;
  if (capacitor?.getPlatform?.() !== "android") {
    onReward();
    return;
  }
  if (rewardedAdPending) return;
  if (status) status.textContent = reviveText.loading;
  else notify(reviveText.loading);
  rewardedAdPending = true;
  host.inert = popup.inert = true;
  camera.cancel();
  let result;
  try {
    result = await capacitor.Plugins.RewardedVideo.show();
    if (status) status.textContent = "";
    else toastNode.hidden = true;
  } catch {
    if (status) status.textContent = reviveText.unavailable;
    else notify(reviveText.unavailable);
  } finally {
    host.inert = popup.inert = false;
    rewardedAdPending = false;
  }
  if (result?.rewarded === true) onReward();
}

function rewardUnavailable() {
  showPopup("Reward unavailable", "Rewarded ads are not configured in this local build.", [["OK", closePopup]]);
}

function settings() {
  const body = document.createElement("div");
  for (const key of ["sound", "haptic"]) {
    const row = document.createElement("label");
    row.className = "setting-row settings-option";
    const icon = picture(url("ui-assets/" + (key === "sound" ? "GP_Icon_Sound-4322.png" : "GP_Icon_Haptic-5226.png")));
    icon.className = "settings-icon";
    const caption = document.createElement("span");
    caption.className = "settings-caption";
    caption.textContent = flowText[key];
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.name = key;
    toggle.setAttribute("role", "switch");
    toggle.checked = player[key];
    toggle.addEventListener("change", () => { player[key] = toggle.checked; persist(); });
    const track = document.createElement("span");
    track.className = "settings-switch";
    track.setAttribute("aria-hidden", "true");
    row.append(icon, caption, toggle, track);
    body.append(row);
  }
  const actions = [[mainMenu.hidden ? flowText.continueGame : flowText.close, closePopup]];
  if (mainMenu.hidden) {
    actions.push([flowText.retry, () => {
      if (catalog.config.heartsEnabled && player.heartSpent) confirmLifeLoss(false, () => restartCurrentRoom(settings), closePopup);
      else restartCurrentRoom(settings);
    }]);
    if (!development) actions.push([menuText.back, showMainMenu]);
  }
  if (mainMenu.hidden && development && !editorPreview) {
    const row = document.createElement("label");
    row.className = "setting-row settings-debug-row";
    const caption = document.createElement("span");
    caption.className = "settings-caption";
    caption.textContent = "Level";
    row.append(caption);
    const number = document.createElement("input");
    number.type = "number"; number.min = "1"; number.max = "9999"; number.value = player.level;
    row.append(number); body.append(row);
    const alternate = document.createElement("label");
    alternate.className = "setting-row settings-debug-row";
    const alternateCaption = document.createElement("span");
    alternateCaption.className = "settings-caption";
    alternateCaption.textContent = "A layouts";
    const toggle = document.createElement("input");
    toggle.type = "checkbox"; toggle.checked = player.variant === 1;
    toggle.name = "variant";
    toggle.setAttribute("role", "switch");
    const track = document.createElement("span");
    track.className = "settings-switch";
    track.setAttribute("aria-hidden", "true");
    alternate.append(alternateCaption, toggle, track); body.append(alternate);
    actions.push(["Load level", () => {
      player.variant = toggle.checked ? 1 : 0;
      player.heartSpent = false;
      closePopup();
      start(Math.max(1, Math.trunc(Number(number.value)) || 1));
    }]);
  }
  popup.style.setProperty("--settings-card-height", body.childElementCount * 72 + 2);
  popup.style.setProperty("--settings-action-count", actions.length);
  showPopup(flowText.settings, body, actions, closePopup, "settings");
  const icons = mainMenu.hidden ? [
    "M8 3 L25 15 L8 27 Z",
    "M25 9 A11 11 0 1 0 25 21 L21 19 A7 7 0 1 1 21 10 L17 13 L28 14 L28 3 Z",
    development ? "M6 3 H24 V13 H29 L15 27 L1 13 H6 V3 Z" : "M2 14 L15 3 L28 14 L25 17 L25 27 H18 V19 H12 V27 H5 V17 Z"
  ] : ["M6 3 L15 12 L24 3 L27 6 L18 15 L27 24 L24 27 L15 18 L6 27 L3 24 L12 15 L3 6 Z"];
  Array.from(popupActions.children).forEach((button, index) => {
    const caption = document.createElement("span");
    caption.textContent = actions[index][0];
    for (const child of Array.from(button.childNodes)) if (child.nodeType === Node.TEXT_NODE) child.remove();
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("settings-action-icon");
    icon.setAttribute("viewBox", "0 0 30 30");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<path d="' + icons[index] + '"/>';
    button.append(icon, caption);
  });
}

function updateLoadingProgress(value, message) {
  if (loading.hidden) return;
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  loadingProgress.value = percent;
  loadingPercentage.textContent = percent + "%";
  if (message) loadingCaption.textContent = message;
}

function resize() {
  const width = host.clientWidth, height = host.clientHeight;
  if (!width || !height) return;
  // Short displays blend width and height on a 1080×2160 reference canvas.
  const shortDisplay = Math.max(width, height) <= 1.6 * Math.min(width, height);
  const widthScale = width / 1080;
  const heightScale = height / 2160;
  const hudScale = shortDisplay ? widthScale * (heightScale / widthScale) ** .864 : widthScale;
  host.style.setProperty("--u", hudScale + "px");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(width, height);
  if (presentation) presentation.resize(width, height, dpr, hudScale);
  render();
  if (presentation && state) presentation.render(state, images, geometry, viewport, presentationTime);
}

function render(now = performance.now()) {
  if (!state || !background) return;
  for (const [index, startedAt] of blockedTaps) {
    if (now - startedAt >= BLOCKED_FEEDBACK_MS || state.items[index].zone !== "board") blockedTaps.delete(index);
  }
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.save();
  context.translate(viewport.x, viewport.y);
  context.scale(viewport.scale, viewport.scale);
  context.drawImage(background, 0, 0);
  for (const item of state.items) {
    if (item.zone !== "board") continue;
    if (item.shadow) context.drawImage(images.get(item.shadow.id), item.shadow.x, item.shadow.y);
    if (item.index === drawnHint) {
      context.shadowColor = "#fff273"; context.shadowBlur = 10 / viewport.scale;
    }
    let image = images.get(item.boardId ?? item.id);
    let pose = geometry[item.index];
    const blockedAt = blockedTaps.get(item.index);
    if (blockedAt !== undefined) {
      const progress = Math.max(0, now - blockedAt) / BLOCKED_FEEDBACK_MS;
      const shake = Math.sin(progress * 8 * Math.PI) * (1 - progress) ** 2 * 5 / viewport.scale;
      const tint = .68 * (1 - Math.max(0, (progress - .3) / .7)) ** 1.6;
      if (!item.boardId) pose = { ...pose, tx: pose.tx + shake };

      // Tint the sprite on its own canvas so transparent pixels keep their alpha.
      if (blockedTint.width !== image.width) blockedTint.width = image.width;
      if (blockedTint.height !== image.height) blockedTint.height = image.height;
      blockedTintContext.globalCompositeOperation = "copy";
      blockedTintContext.globalAlpha = 1;
      blockedTintContext.drawImage(image, 0, 0);
      blockedTintContext.globalCompositeOperation = "source-atop";
      blockedTintContext.globalAlpha = tint;
      blockedTintContext.fillStyle = "#a64a2b";
      blockedTintContext.fillRect(0, 0, image.width, image.height);
      image = blockedTint;
    }
    drawItem(context, image, pose);
    context.shadowBlur = 0;
  }
  context.restore();
}

function updateHud() {
  const signature = JSON.stringify([state.boxes, state.queue, state.items.map(item => item.zone), state.storage]);
  if (signature === hudSignature) return false;
  hudSignature = signature;
  const orders = document.querySelector("#orders");
  if (!orders.children.length) {
    for (let index = 0; index < state.boxes.length; index++) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "box";
      element.dataset.boxIndex = index;
      element.style.setProperty("--box-offset", index - 1);
      element.innerHTML = '<img class="box-back" alt=""><canvas class="box-interior" aria-hidden="true"></canvas><span class="box-body"><span class="box-face"><img class="box-front" alt=""><span class="box-name"></span></span><span class="box-count"></span></span><img class="box-lid" alt="" hidden>';
      element.querySelector(".box-back").src = element.querySelector(".box-front").src = url("ui-assets/outlined-v2/hamper-open.png");
      element.querySelector(".box-lid").src = url("ui-assets/outlined-v2/hamper-lid.png");
      orders.append(element);
    }
  }
  for (const box of state.boxes) {
    const element = orders.children[box.index];
    const order = state.level.order[box.orderIndex];
    element.classList.toggle("locked", box.locked);
    element.classList.toggle("completing", box.completeAt !== null);
    element.classList.toggle("finished", !box.locked && !order);
    const name = element.querySelector(".box-name");
    const category = box.locked ? "Unlock" : order ? catalog.names[order.type] || String(order.type) : "Complete";
    name.textContent = category;
    context.font = '40px "HappyTidy"';
    let fontSize = Math.max(16, Math.min(44, 40 * 212 / Math.max(1, context.measureText(category).width)));
    const twoLines = fontSize < 32 && category.includes(" ");
    name.classList.toggle("two-line", twoLines);
    if (twoLines) {
      const words = category.split(" ");
      let lineWidth = Infinity;
      for (let split = 1; split < words.length; split++) {
        const lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
        const width = Math.max(...lines.map(line => context.measureText(line).width));
        if (width < lineWidth) { lineWidth = width; name.textContent = lines.join("\n"); }
      }
      fontSize = Math.max(16, Math.min(32, 40 * 212 / lineWidth));
    }
    name.style.fontSize = "calc(" + fontSize + " * var(--u))";
    const count = element.querySelector(".box-count");
    count.hidden = box.locked || !order;
    count.textContent = order && !box.locked ? box.arrived + "/" + order.count : "";
    count.style.fontSize = "calc(" + Math.min(40, 40 * 82 / Math.max(1, context.measureText(count.textContent).width)) + " * var(--u))";
    element.setAttribute("aria-label", category + (order && !box.locked ? " " + box.arrived + " of " + order.count : ""));
  }
  const tray = document.querySelector("#queue");
  if (!tray.children.length) {
    for (let slot = 0; slot < MAX_QUEUE_SLOTS; slot++) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "slot";
      element.dataset.slot = slot;
      tray.append(element);
    }
  }
  const freeCount = state.queue.filter(value => value === null).length;
  for (let slot = 0; slot < MAX_QUEUE_SLOTS; slot++) {
    const element = tray.children[slot], index = state.queue[slot];
    const occupied = index != null && state.items[index].zone === "queue";
    element.classList.toggle("reward", slot >= state.queue.length);
    element.classList.toggle("warning", slot < state.queue.length && index == null && freeCount === 1);
    element.setAttribute("aria-label", slot >= state.queue.length ? "Reward waiting slot" : "Waiting slot " + (slot + 1));
    const itemKey = occupied ? player.level + "/" + index : "";
    if (element.dataset.item !== itemKey) {
      element.dataset.item = itemKey;
      element.textContent = "";
      if (occupied) {
        const item = state.items[index];
        const pose = document.createElement("canvas");
        pose.width = pose.height = 112;
        pose.className = "queue-item";
        pose.setAttribute("role", "img");
        pose.setAttribute("aria-label", item.id);
        paintItem(pose.getContext("2d"), images.get(item.id), item, 56, 56, QUEUE_ITEM_EXTENT);
        element.append(pose);
      }
    }
  }
  const storageCount = document.querySelector("#storage span");
  const arrivedInStorage = state.storage.length - state.flights.filter(flight => flight.sweptOnRevive).length;
  storageCount.hidden = !arrivedInStorage;
  storageCount.textContent = arrivedInStorage;
  return true;
}

function changed() {
  presentationTime = state.status === "playing" ? state.now : Math.max(presentationTime, state.now);
  settleWin();
  updateHud();
  render();
  presentation.render(state, images, geometry, viewport, presentationTime);
  persist();
}

function settleWin() {
  if (state.status !== "won" || player.rewardedRun === player.runId) return false;
  if (player.heartSpent) {
    player.hearts = Math.min(MAX_HEARTS, player.hearts + 1);
    player.heartSpent = false;
  }
  const contentLevel = player.level <= 60 ? player.level : 7 + (player.level - 61) % 54;
  const difficulty = (catalog.levels.levels.find(entry => entry.id === player.level) ||
    catalog.levels.levels.find(entry => entry.id === contentLevel))?.difficulty || 0;
  player.coins += [20, 40, 60][difficulty] || 20;
  player.rewardedRun = player.runId;
  return true;
}

function updateBoosters() {
  for (const [type, unlockLevel] of [["vacuum", 3], ["clear", 6]]) {
    const locked = !development && player.level < unlockLevel;
    const button = document.querySelector("#" + type);
    const icon = type === "vacuum" ? "GP_Booster_Vaccum" : "GP_Booster_Clear";
    button.classList.toggle("locked", locked);
    button.querySelector("img").src = url(locked ? "ui-assets/outlined-v2/lock.svg" : ui.get(icon).url);
    const badge = document.querySelector("#" + type + "-count");
    badge.textContent = development ? "∞" : player[type];
    badge.hidden = locked;
    badge.classList.toggle("plus", !development && player[type] <= 0);
  }
}

function offerBoosterTutorial() {
  if (development || !state || state.status !== "playing" || state.paused || document.hidden || popup.open || roomLoading) return;
  const type = player.level >= 3 && !player.tutorialClaims.vacuum ? "vacuum" :
    player.level >= 6 && !player.tutorialClaims.clear ? "clear" : null;
  if (!type) return;
  player[type] = Math.max(2, player[type]);
  player.tutorialClaims[type] = true;
  if (type === "clear") prefillTutorial(state, 3);
  updateHud();
  render();
  updateBoosters();
  persist();
  const body = document.createElement("div");
  const icon = picture(url(ui.get(type === "vacuum" ? "NewBooster_Icon_Vaccum" : "NewBooster_Icon_Clear").url));
  icon.style.width = "130px"; icon.style.height = "130px";
  const explanation = document.createElement("p");
  explanation.textContent = type === "vacuum" ? "Fill a box instantly!" : "Clear all waiting items!";
  body.append(icon, explanation);
  showPopup("New Booster!", body, [["Continue", () => { closePopup(); offerBoosterTutorial(); }]], null);
}

async function start(displayLevel, restore = null, { enterGame = false } = {}) {
  const generation = ++loadingGeneration;
  roomLoading = true;
  storagePreview.close(true);
  if (popup.open) closePopup();
  camera.cancel();
  updateLoadingProgress(55, loadingCopy.loading);
  const content = displayLevel <= 60 ? displayLevel : 7 + (displayLevel - 61) % 54;
  const alternate = player.variant === 1 && [3, 4, 5, 8, 11].includes(content) ? "_A" : "";
  try {
    let nextLevel;
    if (editorPreview) {
      const draft = JSON.parse(sessionStorage.getItem("tidyroom.editor.preview." + editorPreview));
      if (!Array.isArray(draft?.level?.content) || !Array.isArray(draft?.level?.order)) throw new Error("Editor preview expired. Return to the editor and play again.");
      nextLevel = draft.level;
    } else {
      const response = await fetch(url("data/levels/level_" + content + alternate + ".json"));
      if (!response.ok) throw new Error("Level could not be loaded");
      nextLevel = await response.json();
    }
    updateLoadingProgress(60);
    const names = new Set([nextLevel.bg, ...nextLevel.content.flatMap(item => [item.id, item.boardId, item.shadow?.id].filter(Boolean))]);
    const nextImages = new Map();
    let loadedImages = 0;
    await Promise.all(Array.from(names, async name => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = () => reject(new Error("Missing image " + name));
        image.src = url("data/" + catalog.assets[name].url);
      });
      const sourceRect = catalog.nativeRects[name];
      if (sourceRect) {
        const fullImage = document.createElement("canvas");
        fullImage.width = sourceRect.width; fullImage.height = sourceRect.height;
        fullImage.getContext("2d").drawImage(image, Math.round(sourceRect.textureRectOffset.x),
          sourceRect.height - image.height - Math.round(sourceRect.textureRectOffset.y));
        nextImages.set(name, fullImage);
      } else nextImages.set(name, image);
      if (generation === loadingGeneration) updateLoadingProgress(60 + 35 * ++loadedImages / names.size);
    }));
    if (generation !== loadingGeneration) return;
    const nextGeometry = makeGeometry(nextLevel, catalog.assets, nextImages);
    updateLoadingProgress(95, loadingCopy.preparing);
    const blockers = await computeBlockers(nextGeometry);
    if (generation !== loadingGeneration) return;
    const rules = { subgroups: catalog.subgroups, blockers };
    const restored = restore ? restoreSession(nextLevel, rules, restore) : null;
    // A failed run is settled when the app starts again. An in-progress run keeps its reserved life.
    state = restored && restored.status !== "lost" ? restored : createSession(nextLevel, rules);
    level = nextLevel; images = nextImages; geometry = nextGeometry; background = images.get(level.bg);
    if (enterGame) {
      mainMenu.hidden = true;
      host.dataset.screen = "game";
    }
    const continuing = state === restored && state.actions.length > 0;
    if (!continuing) player.heartSpent = false;
    if (!continuing || typeof player.runId !== "string") player.runId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    discardResume = false;
    state.paused = popup.open || !mainMenu.hidden;
    player.level = displayLevel;
    settleWin();
    presentationTime = state.now;
    presentation.reset();
    blockedTaps.clear();
    camera.setScene(background.width, background.height, catalog.config.maxZoomIn || 2);
    completionShown = false; hudSignature = ""; drawnHint = -1;
    const title = document.querySelector("#level-title");
    title.textContent = "LEVEL " + displayLevel;
    context.font = '46px "HappyTidy"';
    title.style.fontSize = "calc(" + Math.min(46, 46 * 210 / Math.max(1, context.measureText(title.textContent).width)) + " * var(--u))";
    updateBoosters();
    lastPick = performance.now(); previousFrame = 0;
    updateHud(); resize(); persist();
    if (mainMenu.hidden) playRoomHudIntro();
    updateLoadingProgress(100);
    loading.hidden = true;
    roomLoading = false;
    refreshHearts();
    if (!document.hidden && !popup.open && state.status === "playing") checkOutOfLives();
    offerBoosterTutorial();
  } catch (error) {
    if (generation !== loadingGeneration) return;
    if (!loading.hidden) loadingCaption.textContent = error.message;
    showPopup("Unable to load", error.message, [["Retry", () => start(displayLevel, restore, { enterGame })]], null);
  }
}

function tap(x, y) {
  if (!state || state.paused || state.status !== "playing" || roomLoading) return;
  const worldX = (x - viewport.x) / viewport.scale, worldY = (y - viewport.y) / viewport.scale;
  for (let index = state.items.length - 1; index >= 0; index--) {
    if (state.items[index].zone !== "board" || !hitContains(geometry[index], worldX, worldY)) continue;
    const reserveLife = !development && catalog.config.heartsEnabled && !player.heartSpent && canPick(state, index);
    if (reserveLife && checkOutOfLives()) return;
    const result = pick(state, index);
    if (result.ok) {
      if (reserveLife) {
        player.hearts--;
        player.heartSpent = true;
        refreshHearts();
      }
      lastPick = performance.now(); drawnHint = -1;
      if (player.haptic && navigator.vibrate) navigator.vibrate(10);
      audio("Bubble tap 1"); changed();
    } else if (result.reason === "covered") {
      blockedTaps.set(index, performance.now());
      audio("tap_blocked");
    }
    break;
  }
}

document.querySelector("#orders").addEventListener("click", event => {
  const element = event.target.closest(".box");
  if (!element || !state || state.paused || roomLoading) return;
  const box = state.boxes[Number(element.dataset.boxIndex)];
  const order = state.level.order[box.orderIndex];
  if (box.locked && state.status === "playing" && !state.inputLocks && state.nextOrderIndex < state.level.order.length) {
    runRewardedVideo(() => { if (unlockBox(state).ok) changed(); });
  } else if (order) notify(catalog.names[order.type] + " · " + box.arrived + " / " + order.count);
});
document.querySelector("#queue").addEventListener("click", event => {
  const element = event.target.closest(".slot");
  if (!element || state?.status !== "playing" || state.paused || state.inputLocks || roomLoading) return;
  if (Number(element.dataset.slot) >= state.queue.length) {
    runRewardedVideo(() => { if (unlockQueueSlot(state).ok) changed(); });
  }
});

menuPlay.addEventListener("click", enterRoom);
document.querySelector("#menu-home").addEventListener("click", showMainMenu);
document.querySelector("#menu-lives").addEventListener("click", () => {
  if (state && !roomLoading && catalog.config.heartsEnabled) showLivesPopup();
});
const openMenuShop = () => {
  if (state && !roomLoading) showCoinShop(0, menuText.back, closePopup);
};
document.querySelector("#menu-coins").addEventListener("click", openMenuShop);
document.querySelector("#menu-shop").addEventListener("click", openMenuShop);
document.querySelector("#menu-settings").addEventListener("click", () => {
  if (state && !roomLoading) settings();
});

document.querySelector("#settings").addEventListener("click", () => {
  if (state?.status === "playing" && !roomLoading) settings();
});
popupClose.addEventListener("click", () => popupDismiss?.());
popup.addEventListener("cancel", event => {
  event.preventDefault();
  if (!rewardedAdPending) popupDismiss?.();
});
document.querySelector("#hearts").addEventListener("click", () => {
  if (state?.status === "playing" && !roomLoading && catalog.config.heartsEnabled) showLivesPopup();
});
storageButton.addEventListener("click", event => {
  if (!state || state.status !== "playing" || state.paused || roomLoading || popup.open || !mainMenu.hidden) return;
  presentation.dismissQueueCategory();
  const icons = state.storage.map(index => {
    const item = state.items[index], pose = document.createElement("canvas");
    pose.width = pose.height = 192;
    pose.dataset.itemIndex = index;
    pose.setAttribute("role", "img");
    pose.setAttribute("aria-label", catalog.names[item.subgroup] || item.id);
    paintItem(pose.getContext("2d"), images.get(item.id), item, 96, 96, 170);
    return pose;
  });
  storagePreviewOwner = state;
  state.paused = true;
  camera.cancel();
  blockedTaps.clear();
  drawnHint = -1;
  render();
  storagePreview.open(icons, storageText.empty, event.detail === 0);
});
for (const [key, action] of [["clear", clearQueue], ["vacuum", vacuum]]) {
  document.querySelector("#" + key).addEventListener("click", () => {
    if (!state || state.paused || roomLoading) return;
    const unlockLevel = key === "vacuum" ? 3 : 6;
    if (!development && player.level < unlockLevel) { notify("Unlocks at level " + unlockLevel); return; }
    if (!development && player[key] <= 0) { rewardUnavailable(); return; }
    const result = action(state);
    if (!result.ok) { notify(key === "clear" ? "No items to clear." : "No box can be filled."); return; }
    audio(key === "clear" ? "Broom booster" : "Vaccum booster");
    if (!development) player[key]--;
    updateBoosters();
    changed();
  });
}
document.addEventListener("visibilitychange", () => {
  previousFrame = 0;
  if (!state) return;
  if (document.hidden) {
    camera.cancel();
    blockedTaps.clear();
    persist();
  } else if (!roomLoading && !rewardedAdPending) {
    render();
    if (!popup.open && state.status === "playing") checkOutOfLives();
    offerBoosterTutorial();
  }
});
window.addEventListener("pagehide", persist);
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(host);

function frame(timestamp) {
  requestAnimationFrame(frame);
  if (!state || document.hidden || roomLoading || rewardedAdPending) { previousFrame = 0; return; }
  const delta = previousFrame ? Math.min(100, timestamp - previousFrame) : 0;
  previousFrame = timestamp;
  if (state.paused) {
    if (storagePreview.active) storagePreview.position();
    if (revivePreview) renderRevivePreview(timestamp);
    return;
  }
  const cameraChanged = camera.update(delta);
  const priorFlights = state.flights.length;
  const wasPlaying = state.status === "playing";
  const result = advance(state, delta);
  presentationTime = wasPlaying ? state.now : presentationTime + delta;
  const hudChanged = result.changed && updateHud();
  if (cameraChanged || hudChanged || blockedTaps.size) render(timestamp);
  const celebratingVictory = presentation.render(state, images, geometry, viewport, presentationTime);
  if (result.changed) {
    if (state.flights.length < priorFlights) audio("sfx_box_in");
    if (hudChanged) persist();
  }
  if (state.status === "playing" && timestamp - lastPick >= catalog.config.hintIdleDelay * 1000) {
    const hint = state.items.find(item => canPick(state, item.index) && acceptingBox(state, item.subgroup));
    const index = hint?.index ?? -1;
    if (drawnHint !== index) { drawnHint = index; render(); }
  }
  if (state.status === "lost" && !completionShown) {
    completionShown = true;
    audio("lose_sfx");
    const { reviveEnabled, disableAdsRelated, maxRevives } = catalog.config;
    if (reviveEnabled && !disableAdsRelated && (!(maxRevives > 0) || state.reviveCount < maxRevives)) {
      persist();
      showRevivePopup();
    } else showFailurePopup();
  }
  if (state.status === "won" && !completionShown) {
    if (settleWin()) { persist(); refreshHearts(); }
    if (celebratingVictory) return;
    completionShown = true;
    audio("win_sfx");
    persist(); refreshHearts();
    showVictoryPopup();
  }
}

async function initialize() {
  try {
    const resourcePaths = ["data/catalog.json", "data/ui.json", "data/order-icons.json", "data/sprite-rects.json", "data/box-animation.json", "data/effects.json"];
    let loadedResources = 0;
    const responses = await Promise.all(resourcePaths.map(async path => {
      const response = await fetch(url(path));
      updateLoadingProgress(15 * ++loadedResources / resourcePaths.length);
      return response;
    }));
    if (responses.some(response => !response.ok)) throw new Error("Game resources are unavailable");
    catalog = await responses[0].json();
    catalog.icons = await responses[2].json();
    catalog.nativeRects = await responses[3].json();
    for (const [name, rect] of Object.entries(catalog.nativeRects)) {
      const asset = catalog.assets[name];
      asset.imageOriginPx[0] += Math.round(rect.textureRectOffset.x);
      asset.imageOriginPx[1] += rect.height - asset.height - Math.round(rect.textureRectOffset.y);
      asset.width = rect.width; asset.height = rect.height;
      asset.textureRect = rect.textureRect;
    }
    ui = new Map((await responses[1].json()).map(entry => [entry.name, entry]));
    const animationData = await responses[4].json();
    presentationConfig = await responses[5].json();
    const texturePaths = new Set(presentationConfig.boxCompleteBurst.map(burst => burst.texture));
    texturePaths.add(presentationConfig.sprites.spark);
    texturePaths.add(presentationConfig.sprites.glow);
    texturePaths.add("ui-assets/outlined-v2/hamper-open.png");
    texturePaths.add("ui-assets/outlined-v2/hamper-lid.png");
    texturePaths.add("ui-assets/reference-popup/atlas.png");
    texturePaths.add("ui-assets/main-menu/reference-v3.png");
    texturePaths.add("ui-assets/main-menu/eye-level-messy-room-v3.png");
    texturePaths.add("ui-assets/outlined-v2/storage.png");
    const reviveBroomPath = "ui-assets/outlined-v2/revive-broom.png";
    texturePaths.add(reviveBroomPath);
    const textures = new Map();
    let loadedTextures = 0;
    await Promise.all([...texturePaths].map(async path => {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url(path); });
      textures.set(path, image);
      updateLoadingProgress(15 + 35 * ++loadedTextures / texturePaths.size);
    }));
    textures.set("spark", textures.get(presentationConfig.sprites.spark));
    textures.set("glow", textures.get(presentationConfig.sprites.glow));
    reviveBroom = textures.get(reviveBroomPath);
    textures.set("reviveBroom", reviveBroom);
    presentation = createPresentation(host, effectsCanvas, animationData.clips, presentationConfig, textures, catalog.config, catalog.names, () => audio("box_close"));
    if (document.fonts) await document.fonts.load('40px "HappyTidy"');
    updateLoadingProgress(53);
    const audioResponse = await fetch(url("data/audio.json"));
    if (audioResponse.ok) {
      extras.audio = await audioResponse.json();
      loadSound("tap_blocked");
    }
    for (const image of document.querySelectorAll("[data-art]")) {
      const entry = ui.get(image.dataset.art);
      if (entry) image.src = url(entry.url);
    }
    updateLoadingProgress(55);
    await start(player.level, saved?.session);
    refreshHearts();
    setInterval(refreshHearts, 1000);
    requestAnimationFrame(frame);
    if (development) window.happyTidy = {
      get state() { return state; }, get geometry() { return geometry; }, get viewport() { return viewport; },
      pick(index) { const result = pick(state, index); changed(); return result; },
      tick(ms) {
        const wasPlaying = state.status === "playing";
        const result = advance(state, ms);
        if (!state.paused && Number.isFinite(ms) && ms >= 0) {
          presentationTime = wasPlaying ? state.now : presentationTime + ms;
        }
        changed();
        return result;
      },
      load: (levelNumber, variant = player.variant) => { player.variant = variant; return start(levelNumber); },
      canPick: index => canPick(state, index),
      snapshot: () => snapshot(state),
      camera
    };
  } catch (error) {
    loadingCaption.textContent = error.message;
  }
}
initialize();

