const prom = require('prom-client');
const express = require('express');
const yaml = require('yamljs');

const { exec } = require('child_process');

const hyperdeck_slot_1_recording_time = new prom.Gauge({
  name: 'hyperdeck_slot_1_recording_time',
  help: 'Recording time available in seconds',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_2_recording_time = new prom.Gauge({
  name: 'hyperdeck_slot_2_recording_time',
  help: 'Recording time available in seconds',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_status = new prom.Gauge({
  name: 'hyperdeck_status',
  help: 'Current transport status (1=active)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version', 'current_status']
});

const hyperdeck_active_slot = new prom.Gauge({
  name: 'hyperdeck_active_slot',
  help: 'Current active slot',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_1_status = new prom.Gauge({
  name: 'hyperdeck_slot_1_status',
  help: 'Slot 1 media status (1=mounted, 0=empty/error)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version', 'slot_status', 'volume_name', 'video_format']
});

const hyperdeck_slot_2_status = new prom.Gauge({
  name: 'hyperdeck_slot_2_status',
  help: 'Slot 2 media status (1=mounted, 0=empty/error)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version', 'slot_status', 'volume_name', 'video_format']
});

const hyperdeck_clip_count = new prom.Gauge({
  name: 'hyperdeck_clip_count',
  help: 'Number of clips on timeline',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_uptime_seconds = new prom.Gauge({
  name: 'hyperdeck_uptime_seconds',
  help: 'Time in seconds since last device boot',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_cache_used_gb = new prom.Gauge({
  name: 'hyperdeck_cache_used_gb',
  help: 'Cache used in GB',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_cache_total_gb = new prom.Gauge({
  name: 'hyperdeck_cache_total_gb',
  help: 'Cache total in GB',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_scrape_duration_seconds = new prom.Gauge({
  name: 'hyperdeck_scrape_duration_seconds',
  help: 'Time taken to collect metrics from HyperDeck',
  labelNames: ['device_name']
});

const hyperdeck_scrape_success = new prom.Gauge({
  name: 'hyperdeck_scrape_success',
  help: '1 if last scrape succeeded, 0 if it failed',
  labelNames: ['device_name']
});

const ipAddress = process.env.HYPERDECK_IP;
const port = 9993;
const commandS1 = 'slot info: slot id: 1';
const commandS2 = 'slot info: slot id: 2';
const commandT = 'transport info';
const commandD = 'device info';
const commandC = 'clips count';
const commandU = 'uptime';
const commandCA = 'cache info';

function log(level, message, extra = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra
  }));
}

function getRemoteTextData(command) {
  return new Promise((resolve, reject) => {
    log('debug', 'Sending command to HyperDeck', { command, ip: ipAddress, port });
    exec(`echo ${command} | nc -w 2 ${ipAddress} ${port}`, (error, stdout, stderr) => {
      if (error) {
        log('error', 'nc exec error', { command, error: error.message });
        reject(error);
        return;
      }
      if (stderr) {
        log('error', 'nc stderr', { command, stderr });
        reject(new Error(stderr));
        return;
      }
      log('debug', 'Received response from HyperDeck', { command, bytes: stdout.length });
      resolve(stdout);
    });
  });
}

function parseUptime(raw) {
  // Response format: "uptime: HH:MM:SS"
  const match = raw.match(/(\d+):(\d+):(\d+)/);
  if (!match) return null;
  const [, h, m, s] = match;
  return (parseInt(h) * 3600) + (parseInt(m) * 60) + parseInt(s);
}

async function getMetrics() {
  prom.register.resetMetrics();

  const scrapeStart = Date.now();
  let deviceModel = 'unknown';

  try {
    log('info', 'Starting metrics collection', { ip: ipAddress });

    const [rawS1, rawS2, rawT, rawD, rawC, rawU, rawCA] = await Promise.all([
      getRemoteTextData(commandS1),
      getRemoteTextData(commandS2),
      getRemoteTextData(commandT),
      getRemoteTextData(commandD),
      getRemoteTextData(commandC),
      getRemoteTextData(commandU),
      getRemoteTextData(commandCA),
    ]);

    const jsonObjectS1 = yaml.parse(rawS1);
    const jsonObjectS2 = yaml.parse(rawS2);
    const jsonObjectT = yaml.parse(rawT);
    const jsonObjectD = yaml.parse(rawD);
    const jsonObjectC = yaml.parse(rawC);
    const jsonObjectCA = yaml.parse(rawCA);

    deviceModel = jsonObjectD['model'];
    const deviceId = jsonObjectD['unique id'];
    const protocolVersion = jsonObjectD['protocol version'];
    const softwareVersion = jsonObjectD['software version'];

    const labels = {
      device_name: deviceModel,
      id: deviceId,
      protocol_version: protocolVersion,
      software_version: softwareVersion
    };

    const slot1Status = jsonObjectS1['status'];
    const slot2Status = jsonObjectS2['status'];
    const slot1Volume = jsonObjectS1['volume name'] || '';
    const slot2Volume = jsonObjectS2['volume name'] || '';
    const slot1Format = jsonObjectS1['video format'] || '';
    const slot2Format = jsonObjectS2['video format'] || '';
    const slot1RecordingTime = Number(jsonObjectS1['recording time']);
    const slot2RecordingTime = Number(jsonObjectS2['recording time']);
    const transportStatus = jsonObjectT['status'];
    const activeSlot = Number(jsonObjectT['slot id']);
    const clipCount = Number(jsonObjectC['clip count']);
    const uptimeSeconds = parseUptime(rawU);
    const cacheUsed = parseFloat(jsonObjectCA['cache used'] || 0);
    const cacheTotal = parseFloat(jsonObjectCA['cache total'] || 0);

    log('info', 'Metrics collected', {
      slot1RecordingTime,
      slot2RecordingTime,
      slot1Status,
      slot2Status,
      slot1Volume,
      slot2Volume,
      transportStatus,
      activeSlot,
      clipCount,
      uptimeSeconds,
      cacheUsed,
      cacheTotal
    });

    hyperdeck_slot_1_recording_time.set(labels, slot1RecordingTime);
    hyperdeck_slot_2_recording_time.set(labels, slot2RecordingTime);
    hyperdeck_status.set({ ...labels, current_status: transportStatus }, 1);
    hyperdeck_active_slot.set(labels, activeSlot);
    hyperdeck_slot_1_status.set({ ...labels, slot_status: slot1Status, volume_name: slot1Volume, video_format: slot1Format }, slot1Status === 'mounted' ? 1 : 0);
    hyperdeck_slot_2_status.set({ ...labels, slot_status: slot2Status, volume_name: slot2Volume, video_format: slot2Format }, slot2Status === 'mounted' ? 1 : 0);
    hyperdeck_clip_count.set(labels, clipCount);
    if (uptimeSeconds !== null) hyperdeck_uptime_seconds.set(labels, uptimeSeconds);
    hyperdeck_cache_used_gb.set(labels, cacheUsed);
    hyperdeck_cache_total_gb.set(labels, cacheTotal);

    const scrapeDuration = (Date.now() - scrapeStart) / 1000;
    hyperdeck_scrape_duration_seconds.set({ device_name: deviceModel }, scrapeDuration);
    hyperdeck_scrape_success.set({ device_name: deviceModel }, 1);

    log('info', 'Metrics collection complete', { durationSeconds: scrapeDuration });

    return prom.register.metrics();

  } catch (e) {
    const scrapeDuration = (Date.now() - scrapeStart) / 1000;
    hyperdeck_scrape_duration_seconds.set({ device_name: deviceModel }, scrapeDuration);
    hyperdeck_scrape_success.set({ device_name: deviceModel }, 0);
    log('error', 'Metrics collection failed', { error: e.message, durationSeconds: scrapeDuration });
    throw e;
  }
}

function main() {
  const app = express();

  app.get(process.env.HEALTH_PATH || '/healthz', (req, res) => {
    log('debug', 'Health check');
    res.send({ status: 'up' });
  });

  app.get(process.env.METRICS_PATH || '/metrics', async (req, res) => {
    log('info', 'Scrape request received');
    try {
      const metrics = await getMetrics();
      res.set('Content-Type', prom.register.contentType);
      res.send(metrics);
    } catch (e) {
      log('error', 'Failed to serve metrics', { error: e.message });
      res.status(500).set('Content-Type', 'text/plain').send(`# Error collecting metrics\n# ${e.message}`);
    }
  });

  app.listen(process.env.PORT || 8000, process.env.HOST || '0.0.0.0', () => {
    log('info', 'Server started', { port: process.env.PORT || 8000, ip: ipAddress });
  });
}

try {
  if (typeof process.env.HYPERDECK_IP == 'undefined') {
    log('error', 'Required environment variable HYPERDECK_IP is undefined');
    process.exit(1);
  }
  main();
} catch (e) {
  log('error', 'Error during startup', { error: e.message, stack: e.stack });
  process.exit(1);
}
