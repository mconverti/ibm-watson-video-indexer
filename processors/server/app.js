/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the “License”);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an “AS IS” BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const bodyParser = require('body-parser'),
  express = require('express'),
  timeout = require('connect-timeout');

const ACTION_TIMEOUT = 3600000;

const processor = value => new Promise((resolve, reject) => {
  console.log('[running] value =', value);
  const spawn = require('child_process').spawn;
  const proc = spawn('node', ['../client/index.js', value], {
    cwd: '../client'
  });

  proc.on('error', (data) => {
    console.log('[exit] with error', data); // eslint-disable-line prefer-template
    reject(data);
  });
  proc.stdout.on('data', (data) => {
    console.log('[stdout]', data.toString()); // eslint-disable-line prefer-template
  });
  proc.stderr.on('data', (data) => {
    console.log('[stderr]', data.toString()); // eslint-disable-line prefer-template
  });
  proc.on('close', (code) => {
    console.log('[exit] with code', code);
    if (code === 0) {
      resolve();
    } else {
      reject('process error');
    }
  });
});

const invokeProcessor = args => processor(JSON.stringify(args));

const app = express();
app.set('port', 8080);
app.use(bodyParser.json());

const server = app.listen(app.get('port'), () => {
  const host = server.address().address;
  const port = server.address().port;
  console.log('[start] listening at http://%s:%s', host, port);
});

server.timeout = 0;

app.post('/init', (req, res) => res.send());
app.post('/run', timeout(ACTION_TIMEOUT), (req, res) => {
  console.log('[run]', req.body);
  const args = req.body.value;

  invokeProcessor(args)
    .then(() => {
      res.json(args);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err });
    });
});
