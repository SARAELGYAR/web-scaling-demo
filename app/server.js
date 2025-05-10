const express = require('express');
const { createClient } = require('redis');
const axios = require('axios');

const serverPort = process.env.SERVER_PORT || 3000;
const serverHost = process.env.SERVER_HOST || '0.0.0.0';

const serverNumber = process.env.SERVER_NUMBER || '1';
const weatherApiUrl = process.env.WEATHER_API_URL;

const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;

const app = express();
app.set('view engine', 'pug');

let redisClient;
let redisAvailable = false;

// Try to connect to Redis
async function initRedis() {
  try {
    redisClient = createClient({
      socket: {
        host: redisHost,
        port: redisPort,
      },
    });
    await redisClient.connect();
    console.log('✅ Connected to Redis');
    redisAvailable = true;
  } catch (error) {
    console.warn('⚠️ Redis not available, proceeding without cache');
    redisAvailable = false;
  }
}

app.get('/', async (req, res) => {
  const cacheKey = `server${serverNumber}:weatherData`;

  let temperature;

  if (redisAvailable) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log('✅ Serving weather from Redis cache');
        const weatherData = JSON.parse(cached);
        temperature = weatherData.current.temperature_2m;
        return res.render('index', { serverNumber, temperature });
      }
    } catch (err) {
      console.warn('❌ Failed to get from Redis:', err.message);
    }
  }

  // Fetch from API
  console.log('🌐 Serving weather from API');
  const response = await axios.get(weatherApiUrl, {
    params: {
      latitude: 30.0626,
      longitude: 31.2497,
      current: 'temperature_2m',
      timezone: 'Africa/Cairo',
    },
  });

  const weatherData = response.data;
  temperature = weatherData.current.temperature_2m;

  if (redisAvailable) {
    try {
      await redisClient.setEx(cacheKey, 600, JSON.stringify(weatherData));
    } catch (err) {
      console.warn('❌ Failed to cache in Redis:', err.message);
    }
  }

  res.render('index', { serverNumber, temperature });
});

async function main() {
  await initRedis();

  const server = app.listen(serverPort, serverHost, () => {
    console.log(`🚀 Listening at http://${serverHost}:${serverPort}`);
  });

  const shutdownHandler = async () => {
    console.log('🛑 Shutting down gracefully...');
    if (redisAvailable) await redisClient.disconnect();
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);
}

main();
