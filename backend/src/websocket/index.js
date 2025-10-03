const WebSocket = require('ws');
const logger = require('../utils/logger');
const clientManager = require('./clientManager');
const { handleMessage } = require('./handlers');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
  });
  
  wss.on('connection', (ws, request) => {
    const clientId = clientManager.addClient(ws, request);

    // Welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      client_id: clientId,
      message: 'Подключение к DashkaBot Cloud успешно!',
      timestamp: new Date().toISOString()
    }));

    // Handle messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        data.sender_id = clientId;
        logger.debug(`WS message from ${clientId}: ${data.type}`);
        handleMessage(clientId, data);
      } catch (error) {
        logger.error(`WS message error from ${clientId}:`, error.message);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clientManager.removeClient(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WS error for ${clientId}:`, error.message);
    });
  });

  logger.info('WebSocket server initialized');
  return wss;
}

module.exports = { setupWebSocket, clientManager };