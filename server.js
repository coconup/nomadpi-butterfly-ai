const express = require('express');
const axios = require('axios');

const { Butterfly } = require('butterfly-ai');

const VanPiService = require('./services/vanpi');
const OpenWeatherMapService = require('./services/open-weather-map');

const app = express();
const port = process.env.PORT || 3000;

const servicesApiRootUrl = process.env.SERVICES_API_ROOT_URL;
const debug = process.env.DEBUG || false;

if(!servicesApiRootUrl) throw `\`$SERVICES_API_ROOT_URL\` is not set`;

app.use(express.json());

const vanPi = new VanPiService();
let butterfly;
let openWeatherMap;

async function initialize() {
  try {
    const openAiApiKey = await axios.get(`${servicesApiRootUrl}/credentials/service/open-ai`);
    const openWeatherMapApiKey = await axios.get(`${servicesApiRootUrl}/credentials/service/open-weather-map`);

    openWeatherMap = new OpenWeatherMapService({ apiKey: openWeatherMapApiKey });
    butterfly = new Butterfly({
      adapter: 'open_ai',
      options: {
        apiKey: openAiApiKey
      },
      debug,
      services: [
        openWeatherMap,
        vanPi
      ]
    });
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
