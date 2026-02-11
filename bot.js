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

  // Invest 5% of resources in defense every turn.
  const armorAmount = Math.floor(resources * 0.05);
  if (armorAmount > 0) {
    actions.push({ type: 'armor', amount: armorAmount });
    resources -= armorAmount;
  }

  // Upgrade up to tower level 4 as soon as we can afford it.
  if (myLevel < 4) {
    const upgradeCost = costToUpgrade(myLevel);
    if (resources >= upgradeCost) {
      actions.push({ type: 'upgrade' });
      resources -= upgradeCost;
    }
  }

  // Start attacking when resources exceed 1.2x total enemy health.
  const enemyLifeByPlayer = enemies.map((enemy) => ({
    playerId: enemy.playerId,
    life: Number(enemy.hp) || 0,
  }));
  const totalEnemyLife = enemyLifeByPlayer.reduce((sum, enemy) => sum + enemy.life, 0);

  if (resources > (1.2 * totalEnemyLife) && resources > 0) {
    let remainingTroops = resources;

    enemyLifeByPlayer
      .sort((a, b) => a.life - b.life)
      .forEach((enemy) => {
        if (remainingTroops <= 0) {
          return;
        }

        const troopsToSend = Math.min(remainingTroops, enemy.life + 1);
        if (troopsToSend > 0) {
          actions.push({
            type: 'attack',
            targetId: enemy.playerId,
            troopCount: troopsToSend,
          });
          remainingTroops -= troopsToSend;
        }
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
    strategy: 'upgrade-to-4-defend-5pct-attack-at-1.2x-enemy-hp',
    version: '1.3',
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
