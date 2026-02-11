const express = require('express');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);

const app = express();

function logRequest() {
  console.log('[KW-BOT] Mega ogudor');
}

function costToUpgrade(level) {
  return Math.round(50 * (1.75 ** (level - 1)));
}

function chooseNegotiation(payload) {
  const enemies = Array.isArray(payload.enemyTowers) ? payload.enemyTowers : [];

  if (enemies.length === 0) {
    return [];
  }

  // Always stay peaceful with all players in both phases.
  return enemies.map((enemy) => ({ allyId: enemy.playerId }));
}

function chooseCombat(payload) {
  const me = payload.playerTower;
  const enemies = Array.isArray(payload.enemyTowers) ? payload.enemyTowers : [];

  if (!me || enemies.length === 0) {
    return [];
  }

  const actions = [];
  let resources = Number(me.resources) || 0;
  const myLevel = Number(me.level) || 1;

  // Phase 1: Peace always, defend, and save for tower level 2.
  if (myLevel < 2) {
    const attackers = (payload.previousAttacks || [])
      .filter((attack) => attack?.action?.targetId === me.playerId).length;

    const defendAmount = attackers > 2 ? 10 : 5;
    const armorAmount = Math.min(resources, defendAmount);

    if (armorAmount > 0) {
      actions.push({ type: 'armor', amount: armorAmount });
      resources -= armorAmount;
    }

    const upgradeCost = costToUpgrade(myLevel);
    if (resources >= upgradeCost) {
      actions.push({ type: 'upgrade' });
    }

    return actions;
  }

  // Phase 2: Keep saving while more than one opponent is still alive.
  if (enemies.length > 1) {
    return actions;
  }

  // One player left: attack only when our money is more than their life.
  const lastEnemy = enemies[0];
  const lastEnemyLife = (Number(lastEnemy.hp) || 0) + (Number(lastEnemy.armor) || 0);

  if (resources > lastEnemyLife && resources > 0) {
    actions.push({
      type: 'attack',
      targetId: lastEnemy.playerId,
      troopCount: resources,
    });
  }

  return actions;
}

app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  logRequest();
  next();
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.get('/info', (_req, res) => {
  res.status(200).json({
    name: 'Mega Ogudor JS Bot',
    strategy: 'two-phase-peace-then-finish',
    version: '1.1',
  });
});

app.post('/negotiate', (req, res) => {
  res.status(200).json(chooseNegotiation(req.body || {}));
});

app.post('/combat', (req, res) => {
  res.status(200).json(chooseCombat(req.body || {}));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json([]);
  }

  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Kingdom Wars bot listening on ${HOST}:${PORT}`);
  });
}
