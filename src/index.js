const prom = require('prom-client');
const express = require('express');
const yaml = require('yamljs');

const { exec } = require('child_process');

const hyperdeck_slot_1_recording_time = new prom.Gauge({
  name: 'hyperdeck_slot_1_recording_time',
  help: 'Recording time available in seconds',
  labelNames: [
    'deviceName'
  ]
});

const hyperdeck_slot_2_recording_time = new prom.Gauge({
  name: 'hyperdeck_slot_2_recording_time',
  help: 'Recording time available in seconds',
  labelNames: [
    'deviceName'
  ]
});

const hyperdeck_status = new prom.Gauge({
  name: 'hyperdeck_status',
  help: 'Current status',
  labelNames: [
    'deviceName',
    'current_status'
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

  hyperdeck_slot_1_recording_time.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, Number(jsonObjectS1['recording time']));

  hyperdeck_slot_2_recording_time.set({
    deviceName: 'HyperDeck Studio HD Mini'
  }, Number(jsonObjectS2['recording time']));

  hyperdeck_status.set({
    deviceName: 'HyperDeck Studio HD Mini',
    current_status: jsonObjectT['status']
  }, 1);

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
