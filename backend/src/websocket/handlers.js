const logger = require('../utils/logger');
const clientManager = require('./clientManager');

function handleSetRole(clientId, data) {
  const { role } = data;
  
  if (clientManager.setClientRole(clientId, role)) {
    const client = clientManager.getClient(clientId);
    client.ws.send(JSON.stringify({
      type: 'role_confirmed',
      role,
      timestamp: new Date().toISOString()
    }));
  }
}

function handleTranslation(clientId, data) {
  logger.info(`Translation from ${clientId}`);
  
  const client = clientManager.getClient(clientId);
  const message = {
    ...data,
    sender_role: client?.role || 'unknown',
    sender_id: clientId,
    timestamp: new Date().toISOString()
  };

  clientManager.broadcastToOthers(clientId, message);
}

function handleMessage(clientId, data) {
  switch (data.type) {
    case 'set_role':
      handleSetRole(clientId, data);
      break;
    case 'translation':
      handleTranslation(clientId, data);
      break;
    default:
      clientManager.broadcastToOthers(clientId, {
        ...data,
        sender_id: clientId,
        timestamp: new Date().toISOString()
      });
  }
}

module.exports = {
  handleMessage,
  handleSetRole,
  handleTranslation
};