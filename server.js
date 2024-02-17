const express = require('express');
const axios = require('axios');

const { Butterfly } = require('butterfly-ai');

const VanPiService = require('./services/vanpi');
const OpenWeatherMapService = require('./services/open-weather-map');

const app = express();
const port = process.env.PORT || 3000;

const servicesApiRootUrl = process.env.SERVICES_API_ROOT_URL;

if(!servicesApiRootUrl) throw `\`$SERVICES_API_ROOT_URL\` is not set`;

// const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(s => !!s).map(s => s.trim());

const vanPi = new VanPiService();

app.use(express.json());

// Add headers before the routes are defined
// app.use(function (req, res, next) {
//   console.log(`Request from origin \`${req.headers.origin}\``)
//   if (allowedOrigins.includes(req.headers.origin)) {
//     res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
//   } else {
//     console.log(`Rejected request from origin \`${req.headers.origin}\``)
//   }

//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
//   res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type,Accept');
//   res.setHeader('Access-Control-Allow-Credentials', true);

//   next();
// });

let butterfly;
let openWeatherMap;

async function initialize() {
  try {
    const openAiApiKey = await axios.get(`${servicesApiRootUrl}/credentials/service/open-ai`);
    const openWeatherMapApiKey = await axios.get(`${servicesApiRootUrl}/credentials/service/open-weather-map`);

    butterfly = new Butterfly({
      adapter: 'open_ai',
      options: {
        apiKey: openAiApiKey
      },
      debug: process.env.DEBUG,
      services: [
        openWeatherMap,
        vanPi
      ]
    });

    openWeatherMap = new OpenWeatherMapService({ apiKey: openWeatherMapApiKey });
  } catch (error) {
    console.error('Error during initialization:', error.message);
  }
};

app.use(async (req, res, next) => {
  await initialize();
  next();
});

app.post('/engine/intent', async (req, res) => {
  const { prompt: userPrompt } = req.body;

  if (!userPrompt) {
    return res.status(400).json({ error: '`prompt` is a required field' });
  }

  try {
    const data = await butterfly.resolveIntent(userPrompt);
    res.json({ data });
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.options('/:serviceId/*', (req, res) => {
  // Respond with the allowed methods and headers for the specified resource
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).end();
});

app.use('/services/:serviceId/*', async (req, res) => {
  const serviceId = req.params.serviceId;
  const functionName = req.params[0];

  try {
    const service = butterfly.getService(serviceId);
    const data = await service.handleFunction(functionName, req.body);

    res.json({ data });
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/engine/command_confirmation', async (req, res) => {
  const { commands } = req.body;

  if (!commands) {
    return res.status(400).json({ error: '`commands` is a required field' });
  }

  try {
    const data = await butterfly.getFreeTextConfirmation(commands);

    res.json({ data });
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
