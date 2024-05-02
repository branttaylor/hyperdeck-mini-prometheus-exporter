const prom = require('prom-client');
const express = require('express');
const yaml = require('yamljs');

const { exec } = require('child_process');

const slot_1_recording_time = new prom.Gauge({
  name: 'slot_1_recording_time',
  help: 'Recording time available in seconds',
  labelNames: [
    'deviceName'
  ]
});

const slot_2_recording_time = new prom.Gauge({
  name: 'slot_2_recording_time',
  help: 'Recording time available in seconds',
  labelNames: [
    'deviceName'
  ]
});

const status_record = new prom.Gauge({
  name: 'status_record',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_shuttle = new prom.Gauge({
  name: 'status_shuttle',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_preview = new prom.Gauge({
  name: 'status_preview',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_stopped = new prom.Gauge({
  name: 'status_stopped',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_play = new prom.Gauge({
  name: 'status_play',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_forward = new prom.Gauge({
  name: 'status_forward',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_rewind = new prom.Gauge({
  name: 'status_rewind',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const status_jog = new prom.Gauge({
  name: 'status_jog',
  help: 'Current status',
  labelNames: [
    'deviceName'
  ]
});

const ipAddress = process.env.HYPERDECK_IP;
const port = 9993;
const commandS1 = 'slot info: slot id: 1';
const commandS2 = 'slot info: slot id: 2';
const commandT = 'transport info';

function getRemoteTextDataS1(ipAddress, port, commandS1) {
  return new Promise((resolve, reject) => {
    exec(`echo ${commandS1} | nc ${ipAddress} ${port}`, (error, stdout, stderr) => {
        if (error) {
            reject(error);
            return;
        }
        if (stderr) {
            reject(stderr);
            return;
        }
        resolve(stdout);
    });
  });
}

function getRemoteTextDataS2(ipAddress, port, commandS2) {
  return new Promise((resolve, reject) => {
    exec(`echo ${commandS2} | nc ${ipAddress} ${port}`, (error, stdout, stderr) => {
        if (error) {
            reject(error);
            return;
        }
        if (stderr) {
            reject(stderr);
            return;
        }
        resolve(stdout);
    });
  });
}

function getRemoteTextDataT(ipAddress, port, commandT) {
  return new Promise((resolve, reject) => {
    exec(`echo ${commandT} | nc ${ipAddress} ${port}`, (error, stdout, stderr) => {
        if (error) {
            reject(error);
            return;
        }
        if (stderr) {
            reject(stderr);
            return;
        }
        resolve(stdout);
    });
  });
}

async function getMetrics() {
  const yamlObjectS1 = await getRemoteTextDataS1(ipAddress, port, commandS1);
  const yamlObjectS2 = await getRemoteTextDataS2(ipAddress, port, commandS2);
  const yamlObjectT = await getRemoteTextDataT(ipAddress, port, commandT);

  const jsonObjectS1 = yaml.parse(yamlObjectS1);
  const jsonObjectS2 = yaml.parse(yamlObjectS2);
  const jsonObjectT = yaml.parse(yamlObjectT);

  slot_1_recording_time.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, Number(jsonObjectS1['recording time']));

  slot_2_recording_time.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, Number(jsonObjectS2['recording time']));

  status_record.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'record' ? 1 : 0);

  status_shuttle.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'shuttle' ? 1 : 0);

  status_preview.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'preview' ? 1 : 0);

  status_stopped.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'stopped' ? 1 : 0);

  status_play.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'play' ? 1 : 0);

  status_forward.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'forward' ? 1 : 0);

  status_rewind.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'rewind' ? 1 : 0);

  status_jog.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, jsonObjectT['status'] === 'jog' ? 1 : 0);

  return prom.register.metrics();
};

function main() {
  const app = express();

  app.get(process.env.HEALTH_PATH || '/healthz', (req, res) => res.send({status: 'up'}));

  app.get(process.env.METRICS_PATH || '/metrics', async (req, res) => {
    let metrics;
    try {
      metrics = await getMetrics();
    } catch (e) {
      console.error('Error getting metrics!!!');
      throw e;
    }
    res.send(metrics);
  });

  app.listen(process.env.PORT || 8000, process.env.HOST || '0.0.0.0', () => console.log('Server is running!!!'));
}

try {
  if (typeof process.env.HYPERDECK_IP == 'undefined'){
    console.log('Required environment variable HYPERDECK_IP is undefined!!!');
    process.exit(1);
  }
  main();
} catch (e) {
  console.error('Error during startup!!!');
  console.error(e.message, e.stack);
  process.exit(1);
}
