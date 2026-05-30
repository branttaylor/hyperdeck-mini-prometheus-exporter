const prom = require('prom-client');
const express = require('express');
const yaml = require('yamljs');

const { exec } = require('child_process');

const hyperdeck_slot_1_recording_time = new prom.Gauge({
  name: 'hyperdeck_slot_1_recording_time',
  help: 'Recording time available in seconds',
  labelNames: [
    'device_name',
    'id',
    'protocol_version',
    'software_version'
  ]
});

const hyperdeck_slot_2_recording_time = new prom.Gauge({
  name: 'hyperdeck_slot_2_recording_time',
  help: 'Recording time available in seconds',
  labelNames: [
    'device_name',
    'id',
    'protocol_version',
    'software_version'
  ]
});

const hyperdeck_status = new prom.Gauge({
  name: 'hyperdeck_status',
  help: 'Current status',
  labelNames: [
    'device_name',
    'id',
    'protocol_version',
    'software_version',
    'current_status'
  ]
});

const hyperdeck_active_slot = new prom.Gauge({
  name: 'hyperdeck_active_slot',
  help: 'Current active slot',
  labelNames: [
    'device_name',
    'id',
    'protocol_version',
    'software_version'
  ]
});

const ipAddress = process.env.HYPERDECK_IP;
const port = 9993;
const commandS1 = 'slot info: slot id: 1';
const commandS2 = 'slot info: slot id: 2';
const commandT = 'transport info';
const commandD = 'device info';

function getRemoteTextData(command) {
  return new Promise((resolve, reject) => {
    exec(`echo ${command} | nc -w 2 ${ipAddress} ${port}`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr) {
        reject(new Error(stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

async function getMetrics() {
  prom.register.resetMetrics();

  const [rawS1, rawS2, rawT, rawD] = await Promise.all([
    getRemoteTextData(commandS1),
    getRemoteTextData(commandS2),
    getRemoteTextData(commandT),
    getRemoteTextData(commandD),
  ]);

  const jsonObjectS1 = yaml.parse(rawS1);
  const jsonObjectS2 = yaml.parse(rawS2);
  const jsonObjectT = yaml.parse(rawT);
  const jsonObjectD = yaml.parse(rawD);

  const deviceModel = jsonObjectD['model'];
  const deviceId = jsonObjectD['unique id'];
  const protocolVersion = jsonObjectD['protocol version'];
  const softwareVersion = jsonObjectD['software version'];

  const labels = {
    device_name: deviceModel,
    id: deviceId,
    protocol_version: protocolVersion,
    software_version: softwareVersion
  };

  hyperdeck_slot_1_recording_time.set(labels, Number(jsonObjectS1['recording time']));
  hyperdeck_slot_2_recording_time.set(labels, Number(jsonObjectS2['recording time']));
  hyperdeck_status.set({ ...labels, current_status: jsonObjectT['status'] }, 1);
  hyperdeck_active_slot.set(labels, Number(jsonObjectT['slot id']));

  return prom.register.metrics();
}

function main() {
  const app = express();

  app.get(process.env.HEALTH_PATH || '/healthz', (req, res) => res.send({ status: 'up' }));

  app.get(process.env.METRICS_PATH || '/metrics', async (req, res) => {
    try {
      const metrics = await getMetrics();
      res.set('Content-Type', prom.register.contentType);
      res.send(metrics);
    } catch (e) {
      console.error('Error getting metrics!!!');
      res.status(500).set('Content-Type', 'text/plain').send(`# Error collecting metrics\n# ${e.message}`);
    }
  });

  app.listen(process.env.PORT || 8000, process.env.HOST || '0.0.0.0', () => console.log('Server is running!!!'));
}

try {
  if (typeof process.env.HYPERDECK_IP == 'undefined') {
    console.log('Required environment variable HYPERDECK_IP is undefined!!!');
    process.exit(1);
  }
  main();
} catch (e) {
  console.error('Error during startup!!!');
  console.error(e.message, e.stack);
  process.exit(1);
}
