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

const hyperdeck_slot_1_remaining_bytes = new prom.Gauge({
  name: 'hyperdeck_slot_1_remaining_bytes',
  help: 'Remaining storage on slot 1 in bytes',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_1_total_bytes = new prom.Gauge({
  name: 'hyperdeck_slot_1_total_bytes',
  help: 'Total storage on slot 1 in bytes',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_2_remaining_bytes = new prom.Gauge({
  name: 'hyperdeck_slot_2_remaining_bytes',
  help: 'Remaining storage on slot 2 in bytes',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_2_total_bytes = new prom.Gauge({
  name: 'hyperdeck_slot_2_total_bytes',
  help: 'Total storage on slot 2 in bytes',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_1_blocked = new prom.Gauge({
  name: 'hyperdeck_slot_1_blocked',
  help: 'Slot 1 blocked status (1=blocked)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_slot_2_blocked = new prom.Gauge({
  name: 'hyperdeck_slot_2_blocked',
  help: 'Slot 2 blocked status (1=blocked)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
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

const hyperdeck_cache_recording_time = new prom.Gauge({
  name: 'hyperdeck_cache_recording_time',
  help: 'Cache recording time available in seconds',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version', 'cache_status']
});

const hyperdeck_reference_locked = new prom.Gauge({
  name: 'hyperdeck_reference_locked',
  help: 'Reference signal locked (1=locked)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version']
});

const hyperdeck_input_video_format = new prom.Gauge({
  name: 'hyperdeck_input_video_format',
  help: 'Input video format present (1=active)',
  labelNames: ['device_name', 'id', 'protocol_version', 'software_version', 'format']
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
  const match = raw.match(/(\d+) \(/);
  if (!match) return null;
  return parseInt(match[1]);
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
    const slot1RemainingBytes = Number(jsonObjectS1['remaining size']);
    const slot2RemainingBytes = Number(jsonObjectS2['remaining size']);
    const slot1TotalBytes = Number(jsonObjectS1['total size']);
    const slot2TotalBytes = Number(jsonObjectS2['total size']);
    const slot1Blocked = jsonObjectS1['blocked'] === 'true' ? 1 : 0;
    const slot2Blocked = jsonObjectS2['blocked'] === 'true' ? 1 : 0;
    const transportStatus = jsonObjectT['status'];
    const activeSlot = Number(jsonObjectT['slot id']);
    const referenceLocked = jsonObjectT['reference locked'] === 'true' ? 1 : 0;
    const inputVideoFormat = jsonObjectT['input video format'] || '';
    const clipCount = Number(jsonObjectC['clip count']);
    const uptimeSeconds = parseUptime(rawU);
    const cacheStatus = jsonObjectCA['status'] || 'none';
    const cacheRecordingTime = Number(jsonObjectCA['recording time'] || 0);

    log('info', 'Metrics collected', {
      slot1Status, slot2Status,
      slot1Volume, slot2Volume,
      slot1RecordingTime, slot2RecordingTime,
      slot1RemainingBytes, slot2RemainingBytes,
      slot1TotalBytes, slot2TotalBytes,
      slot1Blocked, slot2Blocked,
      transportStatus, activeSlot,
      referenceLocked, inputVideoFormat,
      clipCount, uptimeSeconds,
      cacheStatus, cacheRecordingTime
    });

    hyperdeck_slot_1_recording_time.set(labels, slot1RecordingTime);
    hyperdeck_slot_2_recording_time.set(labels, slot2RecordingTime);
    hyperdeck_status.set({ ...labels, current_status: transportStatus }, 1);
    hyperdeck_active_slot.set(labels, activeSlot);
    hyperdeck_slot_1_status.set({ ...labels, slot_status: slot1Status, volume_name: slot1Volume, video_format: slot1Format }, slot1Status === 'mounted' ? 1 : 0);
    hyperdeck_slot_2_status.set({ ...labels, slot_status: slot2Status, volume_name: slot2Volume, video_format: slot2Format }, slot2Status === 'mounted' ? 1 : 0);
    hyperdeck_slot_1_remaining_bytes.set(labels, slot1RemainingBytes);
    hyperdeck_slot_1_total_bytes.set(labels, slot1TotalBytes);
    hyperdeck_slot_2_remaining_bytes.set(labels, slot2RemainingBytes);
    hyperdeck_slot_2_total_bytes.set(labels, slot2TotalBytes);
    hyperdeck_slot_1_blocked.set(labels, slot1Blocked);
    hyperdeck_slot_2_blocked.set(labels, slot2Blocked);
    hyperdeck_clip_count.set(labels, clipCount);
    hyperdeck_reference_locked.set(labels, referenceLocked);
    hyperdeck_input_video_format.set({ ...labels, format: inputVideoFormat }, 1);
    hyperdeck_cache_recording_time.set({ ...labels, cache_status: cacheStatus }, cacheRecordingTime);
    if (uptimeSeconds !== null) hyperdeck_uptime_seconds.set(labels, uptimeSeconds);

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
