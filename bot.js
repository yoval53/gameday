const http = require('http');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);

function logRequest() {
  console.log('[KW-BOT] Mega ogudor');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function costToUpgrade(level) {
  return Math.round(50 * (1.75 ** (level - 1)));
}

function chooseNegotiation(payload) {
  const me = payload.playerTower;
  const enemies = Array.isArray(payload.enemyTowers) ? payload.enemyTowers : [];

  if (!me || enemies.length === 0) {
    return [];
  }

  const strongestEnemy = [...enemies].sort((a, b) => (b.level * 100 + b.hp + b.armor) - (a.level * 100 + a.hp + a.armor))[0];
  const weakestEnemy = [...enemies].sort((a, b) => (a.hp + a.armor) - (b.hp + b.armor))[0];

  if (!strongestEnemy || !weakestEnemy) {
    return [];
  }

  if (strongestEnemy.playerId === weakestEnemy.playerId) {
    return [{ allyId: strongestEnemy.playerId }];
  }

  return [{ allyId: strongestEnemy.playerId, attackTargetId: weakestEnemy.playerId }];
}

function chooseCombat(payload) {
  const me = payload.playerTower;
  const enemies = Array.isArray(payload.enemyTowers) ? payload.enemyTowers : [];
  const actions = [];

  if (!me || enemies.length === 0) {
    return [];
  }

  let resources = Number(me.resources) || 0;
  const upgradeCost = costToUpgrade(me.level || 1);
  const incomingDamage = (payload.previousAttacks || []).filter((a) => a?.action?.targetId === me.playerId)
    .reduce((sum, a) => sum + (Number(a?.action?.troopCount) || 0), 0);

  const armorNeeded = Math.max(0, incomingDamage - (Number(me.armor) || 0));
  const armorSpend = Math.min(resources, Math.min(armorNeeded, Math.max(0, Math.floor(resources * 0.4))));

  if (armorSpend > 0) {
    actions.push({ type: 'armor', amount: armorSpend });
    resources -= armorSpend;
  }

  if (resources >= upgradeCost && (me.level || 1) < 6) {
    actions.push({ type: 'upgrade' });
    resources -= upgradeCost;
  }

  if (resources <= 0) {
    return actions;
  }

  const sortedTargets = [...enemies].sort((a, b) => {
    const aScore = (a.hp + a.armor) - (a.level * 5);
    const bScore = (b.hp + b.armor) - (b.level * 5);
    return aScore - bScore;
  });

  const primary = sortedTargets[0];
  const secondary = sortedTargets[1];

  if (!primary) {
    return actions;
  }

  const primaryTroops = Math.max(1, Math.floor(resources * (secondary ? 0.7 : 1)));
  actions.push({ type: 'attack', targetId: primary.playerId, troopCount: primaryTroops });
  resources -= primaryTroops;

  if (secondary && resources > 0) {
    actions.push({ type: 'attack', targetId: secondary.playerId, troopCount: resources });
  }

  return actions;
}

const server = http.createServer(async (req, res) => {
  logRequest();

  const { method, url } = req;

  if (method === 'GET' && url === '/healthz') {
    return sendJson(res, 200, { status: 'OK' });
  }

  if (method === 'GET' && url === '/info') {
    return sendJson(res, 200, {
      name: 'Mega Ogudor JS Bot',
      strategy: 'AI-trapped-strategy',
      version: '1.0',
    });
  }

  if (method === 'POST' && url === '/negotiate') {
    try {
      const payload = await parseBody(req);
      return sendJson(res, 200, chooseNegotiation(payload));
    } catch {
      return sendJson(res, 400, []);
    }
  }

  if (method === 'POST' && url === '/combat') {
    try {
      const payload = await parseBody(req);
      return sendJson(res, 200, chooseCombat(payload));
    } catch {
      return sendJson(res, 400, []);
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Kingdom Wars bot listening on ${HOST}:${PORT}`);
});
