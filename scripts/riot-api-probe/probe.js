/**
 * UpForge — Riot API Probe
 *
 * PURPOSE:
 *   Run this script while Valorant is open (ideally during a live match).
 *   It captures:
 *     1. Static lockfile API endpoints (presence, PUUID, sessions, help)
 *     2. ALL WebSocket events the Riot Client emits (WAMP opcode 8)
 *     3. ShooterGame.log lines in real-time
 *
 *   Output goes to  ./probe-output-<timestamp>/
 *     snapshot.json       — static endpoint results on launch
 *     events.jsonl        — one JSON line per WebSocket event with timestamp
 *     shootergame.log     — real-time tail of the Valorant log file
 *     summary.txt         — written when you press Ctrl+C
 *
 * SETUP:
 *   cd upforge-desktop/scripts/riot-api-probe
 *   npm install
 *   node probe.js
 *
 * REQUIREMENTS:
 *   - Riot Client must be running (lockfile must exist)
 *   - Valorant should be open; ideally play a full round during capture
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');

// ─── Config ──────────────────────────────────────────────────────────────────

const LOCKFILE_PATH = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.HOME, 'AppData', 'Local'),
  'Riot Games', 'Riot Client', 'Config', 'lockfile'
);

const SHOOTER_LOG_PATH = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.HOME, 'AppData', 'Local'),
  'VALORANT', 'Saved', 'Logs', 'ShooterGame.log'
);

const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function readLockfile() {
  const raw = fs.readFileSync(LOCKFILE_PATH, 'utf8').trim();
  const [name, pid, port, password, protocol] = raw.split(':');
  return { name, pid, port: parseInt(port, 10), password, protocol };
}

function localFetch(port, password, urlPath) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${password}`).toString('base64');
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Read lockfile ──────────────────────────────────────────────────────
  let lock;
  try {
    lock = readLockfile();
    console.log(`✅  Lockfile found → port=${lock.port}`);
  } catch (e) {
    console.error(`❌  Cannot read lockfile at:\n    ${LOCKFILE_PATH}`);
    console.error('    Make sure the Riot Client is running.');
    process.exit(1);
  }

  // ── 2. Output directory ───────────────────────────────────────────────────
  const runId = Date.now();
  const outDir = path.join(__dirname, `probe-output-${runId}`);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`📁  Writing output to: ${outDir}\n`);

  const snapshotPath    = path.join(outDir, 'snapshot.json');
  const eventsPath      = path.join(outDir, 'events.jsonl');
  const logMirrorPath   = path.join(outDir, 'shootergame.log');
  const summaryPath     = path.join(outDir, 'summary.txt');

  const eventsStream    = fs.createWriteStream(eventsPath, { flags: 'a' });
  const logMirrorStream = fs.createWriteStream(logMirrorPath, { flags: 'a' });

  // ── 3. Static snapshot ────────────────────────────────────────────────────
  console.log('📡  Querying static endpoints…');
  const snapshot = { lockfile: { ...lock, password: '***' }, endpoints: {} };

  const endpoints = [
    '/entitlements/v1/token',
    '/chat/v4/presences',
    '/product-session/v1/external-sessions',
    '/chat/v1/session',
    '/help',
  ];

  for (const ep of endpoints) {
    try {
      const result = await localFetch(lock.port, lock.password, ep);
      snapshot.endpoints[ep] = result;
      console.log(`  ${result.status === 200 ? '✅' : '⚠️ '} ${ep} → HTTP ${result.status}`);
    } catch (e) {
      snapshot.endpoints[ep] = { error: e.message };
      console.log(`  ❌  ${ep} → ${e.message}`);
    }
  }

  // Decode own Valorant presence private field if available
  try {
    const presences = snapshot.endpoints['/chat/v4/presences']?.body?.presences ?? [];
    const ownPuuid  = snapshot.endpoints['/entitlements/v1/token']?.body?.subject;
    const own = presences.find(p => p.puuid === ownPuuid && p.product === 'valorant');
    if (own?.private) {
      try {
        const decoded = JSON.parse(Buffer.from(own.private, 'base64').toString('utf8'));
        snapshot.ownValorantPresence = decoded;
        console.log(`\n  🎮  Valorant presence decoded:`);
        console.log(`      sessionLoopState : ${decoded.sessionLoopState}`);
        console.log(`      queueId          : ${decoded.queueId}`);
        console.log(`      matchMap         : ${decoded.matchMap}`);
        console.log(`      score            : ${decoded.partyOwnerMatchScoreAllyTeam} - ${decoded.partyOwnerMatchScoreEnemyTeam}`);
      } catch {}
    }
  } catch {}

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅  Snapshot saved → ${snapshotPath}`);

  // ── 4. WebSocket – subscribe to ALL events ────────────────────────────────
  const helpEvents = Object.keys(snapshot.endpoints['/help']?.body?.events ?? {});
  console.log(`\n🔌  Connecting to WebSocket (${helpEvents.length} events to subscribe)…`);

  const wsUrl = `wss://riot:${lock.password}@127.0.0.1:${lock.port}`;
  const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });

  const eventCounts = {};
  let totalEvents   = 0;

  ws.on('open', () => {
    console.log('✅  WebSocket connected — subscribing to all events…');
    // Subscribe to every named event (more detail than blanket OnJsonApiEvent)
    for (const name of helpEvents) {
      if (name !== 'OnJsonApiEvent') {
        ws.send(JSON.stringify([5, name]));
      }
    }
    // Also subscribe to the catch-all
    ws.send(JSON.stringify([5, 'OnJsonApiEvent']));
    console.log('⏳  Waiting for events. Play a Valorant match now. Press Ctrl+C when done.\n');
  });

  ws.on('message', (raw) => {
    const line = raw.toString();
    try {
      const parsed = JSON.parse(line);
      // WAMP opcode 8 = event
      if (parsed[0] === 8) {
        const eventName = parsed[1];
        const payload   = parsed[2] ?? {};
        const uri       = payload.uri ?? '';
        const eventType = payload.eventType ?? '';
        const data      = payload.data;

        totalEvents++;
        eventCounts[eventName] = (eventCounts[eventName] ?? 0) + 1;

        const record = { t: ts(), event: eventName, uri, eventType, data };
        eventsStream.write(JSON.stringify(record) + '\n');

        // Print interesting events to console
        const interesting = [
          'presences', 'session', 'core-game', 'pregame',
          'kill', 'round', 'spike', 'bomb', 'match',
          'messaging-service', 'riot-messaging',
        ];
        if (interesting.some(k => (eventName + uri).toLowerCase().includes(k))) {
          console.log(`  📨  ${eventName}  ${uri}  (${eventType})`);
          if (data && typeof data === 'object') {
            // Try to decode base64 private fields
            if (data.private) {
              try {
                const dec = JSON.parse(Buffer.from(data.private, 'base64').toString());
                console.log(`       presence: state=${dec.sessionLoopState} queue=${dec.queueId} score=${dec.partyOwnerMatchScoreAllyTeam}-${dec.partyOwnerMatchScoreEnemyTeam}`);
              } catch {}
            } else {
              // Print first 200 chars of data
              const preview = JSON.stringify(data).slice(0, 200);
              console.log(`       data: ${preview}${preview.length >= 200 ? '…' : ''}`);
            }
          }
        }
      }
    } catch {}
  });

  ws.on('error', (e) => console.error('WebSocket error:', e.message));
  ws.on('close', () => console.log('\n🔌  WebSocket closed'));

  // ── 5. ShooterGame.log tail ───────────────────────────────────────────────
  let logWatcher = null;
  try {
    if (fs.existsSync(SHOOTER_LOG_PATH)) {
      const stats   = fs.statSync(SHOOTER_LOG_PATH);
      let filePos   = stats.size; // start from end (don't replay history)
      console.log(`📋  Tailing ShooterGame.log from byte ${filePos}…`);

      logWatcher = fs.watch(SHOOTER_LOG_PATH, () => {
        const fd = fs.openSync(SHOOTER_LOG_PATH, 'r');
        const newStats = fs.fstatSync(fd);
        if (newStats.size > filePos) {
          const buf  = Buffer.alloc(newStats.size - filePos);
          fs.readSync(fd, buf, 0, buf.length, filePos);
          filePos = newStats.size;
          const text = buf.toString('utf8');
          logMirrorStream.write(text);

          // Print lines that look interesting
          const lines = text.split('\n');
          for (const line of lines) {
            const low = line.toLowerCase();
            if (low.includes('kill') || low.includes('death') || low.includes('spike') ||
                low.includes('bomb') || low.includes('round') || low.includes('planted') ||
                low.includes('defus') || low.includes('detonat')) {
              console.log(`  📋  LOG: ${line.slice(0, 160)}`);
            }
          }
        }
        fs.closeSync(fd);
      });
    } else {
      console.log(`⚠️   ShooterGame.log not found at:\n    ${SHOOTER_LOG_PATH}\n    (normal if Valorant isn't loaded yet)`);
    }
  } catch (e) {
    console.log(`⚠️   Could not watch ShooterGame.log: ${e.message}`);
  }

  // ── 6. Shutdown handler ───────────────────────────────────────────────────
  async function shutdown() {
    console.log('\n\n🛑  Stopping probe…');
    if (logWatcher) logWatcher.close();
    ws.close();
    eventsStream.end();
    logMirrorStream.end();

    // Write summary
    const sortedEvents = Object.entries(eventCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `  ${String(count).padStart(5)}x  ${name}`)
      .join('\n');

    const summary = [
      `Probe run: ${new Date(runId).toISOString()}`,
      `Total events captured: ${totalEvents}`,
      '',
      'Event counts (most frequent first):',
      sortedEvents,
      '',
      'Output files:',
      `  ${snapshotPath}`,
      `  ${eventsPath}`,
      `  ${logMirrorPath}`,
    ].join('\n');

    fs.writeFileSync(summaryPath, summary);
    console.log('\n' + summary);
    console.log(`\n📦  All output in: ${outDir}`);
    console.log('    Share the entire probe-output-* folder so we can analyse the results.\n');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
