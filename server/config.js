const path = require('path');

const config = {
  baseUrl: process.env.BASE_URL || 'ws://localhost:12606',
  model: process.env.MODEL || 'gpt-4',
  port: parseInt(process.env.API_PORT || '12600', 10),
  wsPort: parseInt(process.env.WS_PORT || '12606', 10),
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '300000', 10)
};

module.exports = config;
