const WebSocket = require('ws');
const config = require('./config');
const MessageRouter = require('./message-router');
const OpenAIAPIServer = require('./openai-api-server');
const WSManagerHandler = require('./ws-manager-handler');

const messageRouter = new MessageRouter();
const apiServer = new OpenAIAPIServer(messageRouter);
const managerHandler = new WSManagerHandler(messageRouter);

const PORT = config.wsPort;
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket服务器运行在 ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const clientId = req.socket.remoteAddress;
  console.log(`新客户端连接: ${clientId}`);

  messageRouter.registerWebSocketClient(ws);
  managerHandler.registerClient(ws);

  ws.send(JSON.stringify({
    type: 'connected',
    data: { message: '已连接到服务器' },
    timestamp: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`[${new Date().toLocaleTimeString()}] 收到消息:`, data.type);

      if (data.type === 'chat_request') {
        console.log('  聊天请求:', data.model);
        return;
      }

      if (data.type === 'manager_response') {
        messageRouter.handleManagerResponse(data);
        return;
      }

      switch (data.type) {
        case 'conversations':
          console.log('  会话列表更新:', data.data.conversations.length, '个会话');
          break;

        case 'roles':
          console.log('  角色列表更新:', data.data.roles.length, '个角色');
          break;

        case 'message':
          console.log('  新消息:', {
            conversationId: data.data.conversationId,
            isUser: data.data.message.isUser,
            content: data.data.message.content.substring(0, 50) + '...'
          });
          broadcastToOthers(ws, data);
          break;

        case 'ai_response':
          console.log('  AI响应:', data.requestId);
          break;

        default:
          console.log('  消息类型:', data.type);
      }
    } catch (error) {
      console.error('解析消息失败:', error);
    }
  });

  ws.on('close', () => {
    console.log(`客户端断开连接: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`客户端错误: ${clientId}`, error);
  });
});

// 广播消息给其他客户端
function broadcastToOthers(sender, message) {
  messageRouter.wsClients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// 广播消息给所有客户端
function broadcastToAll(message) {
  messageRouter.wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

async function startServers() {
  try {
    await apiServer.start();
    console.log('');
    console.log('=================================');
    console.log('🚀 所有服务器已启动');
    console.log('=================================');
    console.log(`📡 WebSocket 服务器: ws://localhost:${config.wsPort}`);
    console.log(`🌐 OpenAI API 端点: http://localhost:${config.port}/v1`);
    console.log(`🔧 MCP 端点: http://localhost:${config.port}/mcp`);
    console.log(`📚 快速开始指南: 查看 QUICKSTART.md`);
    console.log('=================================');
    console.log('');
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
}

setInterval(() => {
  broadcastToAll({
    type: 'heartbeat',
    data: { 
      time: new Date().toISOString(),
      connected_clients: messageRouter.getConnectedClientsCount()
    },
    timestamp: Date.now()
  });
}, 30000);

startServers();

process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  
  wss.clients.forEach(client => {
    client.close();
  });
  
  await apiServer.stop();
  
  wss.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
