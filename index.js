// ============================================================
// HKITBOT - MINEFLAYER KIT BOT (LIMBO / BOT-FILTER FIX)
// Minecraft 1.20.1
// ============================================================

const mineflayer = require('mineflayer');
const autoAuth = require('mineflayer-auto-auth');
const { pathfinder } = require('mineflayer-pathfinder');
const readline = require('readline');

const CONFIG = {
  host: 'mc.anarcion.com',
  port: 25565,
  username: 'hkitbot',
  version: '1.20.1',
  password: 'bapa4',
  reconnectDelay: 15000,
  tpaAcceptWait: 10000,
  teleportDelay: 1200,
  announcementDelay: 5000,
  announcementInterval: 60000
};

let globalBot = null;
const kitQueue = [];
let isProcessing = false;
let currentTarget = null;
let announcementInterval = null;
let tpaTimeoutTimer = null;
let deliverySafetyTimer = null;
let botGeneration = 0;
let waitingForTeleport = false;
let teleportStartPosition = null;

function getRandomSuffix() {
  return ` [${Math.floor(Math.random() * 90) + 10}]`;
}

function clearTpaTimer() {
  if (tpaTimeoutTimer) { clearTimeout(tpaTimeoutTimer); tpaTimeoutTimer = null; }
}

function clearDeliveryTimer() {
  if (deliverySafetyTimer) { clearTimeout(deliverySafetyTimer); deliverySafetyTimer = null; }
}

function safeChat(message) {
  try {
    if (globalBot && typeof globalBot.chat === 'function') {
      globalBot.chat(message);
      return true;
    }
  } catch (err) {
    console.log('[CHAT HATA]', err.message);
  }
  return false;
}

function resetAndNextQueue() {
  clearTpaTimer();
  clearDeliveryTimer();
  isProcessing = false;
  currentTarget = null;
  waitingForTeleport = false;
  teleportStartPosition = null;
  console.log('[Kuyruk] Mevcut işlem temizlendi.');
  setTimeout(() => { processQueue(); }, 1000);
}

function getFirstUsableItem(bot) {
  if (!bot || !bot.inventory) return null;
  const items = bot.inventory.items();
  return (items && items.length > 0) ? items[0] : null;
}

async function equipItemForThrow(bot, item) {
  if (!item) return false;
  try {
    if (item.slot >= 36 && item.slot <= 44) {
      bot.setQuickBarSlot(item.slot - 36);
      await new Promise(r => setTimeout(r, 250));
      return true;
    }
    await bot.equip(item, 'hand');
    await new Promise(r => setTimeout(r, 250));
    return true;
  } catch (err) {
    return false;
  }
}

async function throwKit(bot) {
  if (!bot || !bot.inventory) return false;
  const item = getFirstUsableItem(bot);
  if (!item) return false;
  const equipped = await equipItemForThrow(bot, item);
  if (!equipped) return false;

  try {
    const heldItem = bot.heldItem;
    if (!heldItem) return false;
    await bot.tossStack(heldItem);
    console.log(`[Teslimat] ${heldItem.name} atıldı.`);
    return true;
  } catch (err) {
    return false;
  }
}

async function processQueue() {
  if (isProcessing || kitQueue.length === 0) return;
  const bot = globalBot;
  if (!bot || !bot.entity || !bot.inventory) return;

  const item = getFirstUsableItem(bot);
  if (!item) return;

  isProcessing = true;
  currentTarget = kitQueue.shift();
  waitingForTeleport = false;
  teleportStartPosition = bot.entity.position.clone();
  const target = currentTarget;

  console.log(`[İşlem] ${target} için teslimat başladı.`);
  safeChat(`> ${target} TPA atıyorum, kabul et.${getRandomSuffix()}`);

  setTimeout(() => {
    if (globalBot !== bot || !bot.entity) { resetAndNextQueue(); return; }
    try {
      bot.chat(`/tpa ${target}`);
      waitingForTeleport = true;
      teleportStartPosition = bot.entity.position.clone();
      clearTpaTimer();
      tpaTimeoutTimer = setTimeout(() => {
        if (isProcessing && currentTarget === target && waitingForTeleport) {
          safeChat(`> ${target} kabul etmediğin için geçiliyoruz.${getRandomSuffix()}`);
          resetAndNextQueue();
        }
      }, CONFIG.tpaAcceptWait);
    } catch (err) {
      resetAndNextQueue();
    }
  }, 800);
}

function checkTeleport(bot) {
  if (!isProcessing || !currentTarget || !waitingForTeleport || !bot.entity) return;
  if (!teleportStartPosition) { teleportStartPosition = bot.entity.position.clone(); return; }
  const cp = bot.entity.position;
  const dist = Math.sqrt(Math.pow(cp.x - teleportStartPosition.x, 2) + Math.pow(cp.y - teleportStartPosition.y, 2) + Math.pow(cp.z - teleportStartPosition.z, 2));
  if (dist >= 3) {
    waitingForTeleport = false;
    clearTpaTimer();
    handleSuccessfulTeleport(bot);
  }
}

async function handleSuccessfulTeleport(bot) {
  if (!isProcessing || !currentTarget) return;
  console.log(`[Teslimat] Teleport algılandı.`);
  await new Promise(r => setTimeout(r, CONFIG.teleportDelay));
  if (!bot.entity) { resetAndNextQueue(); return; }
  await throwKit(bot);
  await new Promise(r => setTimeout(r, 500));
  try { if (bot.entity) bot.chat('/kill'); } catch (err) {}
  clearDeliveryTimer();
  deliverySafetyTimer = setTimeout(() => { if (isProcessing) resetAndNextQueue(); }, 6000);
}

function createMyBot() {
  const generation = ++botGeneration;
  console.log('[Sistem] Sunucuya bağlanılıyor...');

  const bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    plugins: [autoAuth, pathfinder],
    AutoAuth: { logging: false, password: CONFIG.password, ignoreRepeat: true }
  });

  globalBot = bot;

  // LIMBO FILTER BYPASS - Henüz oyuna girmeden gelen paket seviyesindeki mesajlar
  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString();
    console.log(`[SUNUCU MESAJI]: ${text}`);

    // Limbo/BotFilter kayıt ve giriş komutu yakalama
    if (text.includes('/register') || text.includes('register')) {
      bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
    } else if (text.includes('/login') || text.includes('login')) {
      bot.chat(`/login ${CONFIG.password}`);
    }
  });

  bot.once('spawn', () => {
    console.log('>> HKITBOT BAŞARIYLA SAVAŞ ALANINA DOĞDU!');

    setTimeout(() => {
      if (globalBot === bot && bot.entity) {
        safeChat(`> Kit almak için ?hkit yazabilirsiniz!${getRandomSuffix()}`);
      }
    }, CONFIG.announcementDelay);

    setTimeout(() => { if (globalBot === bot) processQueue(); }, 4000);

    if (announcementInterval) clearInterval(announcementInterval);
    announcementInterval = setInterval(() => {
      if (globalBot === bot && bot.entity) {
        safeChat(`> Kit almak için ?hkit yazabilirsiniz!${getRandomSuffix()}`);
      }
    }, CONFIG.announcementInterval);
  });

  bot.on('chat', (username, message) => {
    if (!username || username === bot.username || !message) return;
    const msg = message.trim().toLowerCase();

    if (msg === '?hkit' || msg === '?kit') {
      if (currentTarget === username || kitQueue.includes(username)) return;
      kitQueue.push(username);
      console.log(`[Kuyruk] ${username} eklendi.`);
      if (!isProcessing) processQueue();
    }
  });

  bot.on('move', () => { if (globalBot === bot) checkTeleport(bot); });
  bot.on('forcedMove', () => {
    if (isProcessing && waitingForTeleport) {
      waitingForTeleport = false;
      clearTpaTimer();
      handleSuccessfulTeleport(bot);
    }
  });

  bot.on('end', (reason) => {
    console.log(`[BOT] Ayrıldı: ${reason}`);
    clearTpaTimer();
    clearDeliveryTimer();
    if (announcementInterval) clearInterval(announcementInterval);
    isProcessing = false;
    currentTarget = null;

    if (generation === botGeneration) {
      setTimeout(() => { createMyBot(); }, CONFIG.reconnectDelay);
    }
  });

  bot.on('error', (err) => console.log(`[HATA] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`[KICK REASON] ${reason}`));
}

if (!global.rlInitialized) {
  global.rlInitialized = true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (input) => {
    if (globalBot && globalBot.entity) globalBot.chat(input.trim());
  });
}

createMyBot();