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
  const myLife = Number(me.hp) || 0;
  const myDefense = Number(me.defense ?? me.armor ?? 0) || 0;

  // Only invest in defense if our life is the minimum among all players.
  const lowestEnemyLife = enemies.reduce((minLife, enemy) => {
    const enemyLife = Number(enemy.hp) || 0;
    return Math.min(minLife, enemyLife);
  }, Number.POSITIVE_INFINITY);
  const hasMinimumLife = myLife <= lowestEnemyLife;

  const enemyIncomes = enemies.map((enemy) => Number(
    enemy.income
    ?? enemy.passiveIncome
    ?? enemy.goldPerTurn
    ?? enemy.resourceIncome,
  ) || 0);
  const totalEnemyIncome = enemyIncomes.reduce((sum, income) => sum + income, 0);

  // If only one enemy is left, always invest in defense to reach enemy income + 5.
  if (enemies.length === 1) {
    const defenseTarget = enemyIncomes[0] + 5;
    const defenseGap = Math.max(0, defenseTarget - (myLife + myDefense));
    const armorAmount = Math.min(resources, defenseGap);
    if (armorAmount > 0) {
      actions.push({ type: 'armor', amount: armorAmount });
      resources -= armorAmount;
    }
  } else if (hasMinimumLife) {
    // Otherwise, only invest in defense when we have minimum life,
    // until life + defense matches combined enemy income.
    const defenseGap = Math.max(0, totalEnemyIncome - (myLife + myDefense));
    const armorAmount = Math.min(resources, defenseGap);
    if (armorAmount > 0) {
      actions.push({ type: 'armor', amount: armorAmount });
      resources -= armorAmount;
    }
  }

  // Keep upgrading whenever we can afford the next level.
  const upgradeCost = costToUpgrade(myLevel);
  if (resources >= upgradeCost) {
    actions.push({ type: 'upgrade' });
    resources -= upgradeCost;
  }

  // Start attacking when resources exceed 1.1x enemy health + defense.
  const enemyLifeByPlayer = enemies
    .map((enemy) => ({
      playerId: enemy.playerId,
      life: Number(enemy.hp) || 0,
      defense: Number(enemy.defense ?? enemy.armor ?? 0) || 0,
    }))
    .filter((enemy) => enemy.life > 0);
  const totalEnemyLifeAndDefense = enemyLifeByPlayer
    .reduce((sum, enemy) => sum + enemy.life + enemy.defense, 0);

  if (resources > (1.1 * totalEnemyLifeAndDefense) && resources > 0) {
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
    strategy: 'defend-when-my-life-is-minimum-to-total-enemy-income-or-always-defend-vs-one-enemy-to-income-plus-5-upgrade-when-affordable-attack-at-1.1x-enemy-hp-plus-defense',
    version: '1.7',
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
