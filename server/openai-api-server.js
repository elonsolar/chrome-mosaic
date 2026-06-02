const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const ToolConverter = require('./tool-converter');
const MessageRouter = require('./message-router');
const MCPHandler = require('./mcp-handler');

class OpenAIAPIServer {
  constructor(messageRouter) {
    this.app = express();
    this.messageRouter = messageRouter;
    this.toolConverter = new ToolConverter();
    this.mcpHandler = new MCPHandler(messageRouter);
    this.conversationState = new Map();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(bodyParser.json());
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
  }

  setupRoutes() {
    this.app.post('/v1/chat/completions', this.handleChatCompletion.bind(this));
    
    this.app.post('/mcp', this.mcpHandler.handleRequest.bind(this.mcpHandler));
    this.app.get('/mcp', this.mcpHandler.handleGet.bind(this.mcpHandler));
    this.app.delete('/mcp', this.mcpHandler.handleDelete.bind(this.mcpHandler));

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        connected_clients: this.messageRouter.getConnectedClientsCount(),
        pending_requests: this.messageRouter.getPendingRequestsCount()
      });
    });

    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  async handleChatCompletion(req, res) {
    const requestId = uuidv4();
    try {
      console.log('\n========== [API] Headers ==========');
      console.log('[API] Headers:', JSON.stringify(req.headers, null, 2));
      console.log('[API] x-session-affinity:', req.headers['x-session-affinity'] || '(not set)');
      console.log('[API] ==============================\n');

      const { model, messages, tools, stream = false, tool_choice } = req.body;

      console.log('\n========== [API] 请求开始 ==========');
      console.log('[API] Request ID:', requestId);
      console.log('[API] Model:', model || config.model);
      console.log('[API] Stream:', stream);
      console.log('[API] Messages count:', messages?.length);
      console.log('[API] Tools count:', tools?.length || 0);
      console.log('[API] first message:', messages[0]);
      console.log('[API] second message:', messages[0]);
      // if (tools && tools.length > 0) {
      //   console.log('[API] Tools:', JSON.stringify(tools.map(t => ({
      //     name: t.function?.name,
      //     params: Object.keys(t.function?.parameters?.properties || {})
      //   })), null, 2));
      // }
      console.log('[API] Last message content:', messages?.[messages.length - 1]);

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          error: {
            message: 'Invalid request: messages array is required',
            type: 'invalid_request_error'
          }
        });
      }

      const conversationId = req.headers['x-session-affinity'];

      const isFirstSend = messages.length === 2 && 
                         messages[0].role === 'system' && 
                         messages[1].role === 'user';

      console.log('[API] Conversation ID:', conversationId.substring(0, 50) + '...');
      console.log('[API] Is first send:', isFirstSend);

      const firstMessageContent = this.normalizeContent(messages[0]?.content || '');
      if (firstMessageContent.includes('You are a title generator')) {
        console.log('[API] 检测到标题生成请求，使用本地生成');

        const lastMessage = messages[messages.length - 1];
        let userContent = '';
        if (lastMessage?.content) {
          const content = lastMessage.content;
          if (typeof content === 'string') {
            userContent = content;
          } else if (Array.isArray(content)) {
            userContent = content
              .filter(item => 
                item.type === 'text' && 
                !item.text.includes('<system-reminder>')
              )
              .map(item => item.text || '')
              .join('\n');
          }
        }
        const title = this.extractFirstSentence(userContent);

        if (stream) {
          return await this.sendTitleStreamResponse(req, res, title, requestId);
        } else {
          return this.sendTitleNonStreamResponse(req, res, title, requestId);
        }
      }

      let messagesToSend;

      if (isFirstSend) {
        console.log('[API] 第一次发送：发送 system + user（合并）');
        const systemContent = this.normalizeContent(messages[0].content);
        const userContent = this.normalizeContent(messages[1].content);
        let combinedContent = `${systemContent}\n\n`;

        if (tools && tools.length > 0) {
          combinedContent = this.toolConverter.appendToolInstruction(combinedContent, tools);
          console.log('[API] 追加 tool 指令，增强消息长度:', combinedContent.length);
        }

        messagesToSend = [
          {
            role: 'user',
            content: `${combinedContent}\n\n${userContent} `
          }
        ];

        this.conversationState.set(conversationId, {
          sentCount: messages.length,
          lastSentTime: Date.now()
        });
      } else {
        console.log('[API] 后续发送：只发送新增消息');
        const state = this.conversationState.get(conversationId) || { sentCount: 0 };
        const previouslySentCount = state.sentCount;


        console.log('[API] previouseSentCount:', previouslySentCount);
        const newMessages = messages.slice(previouslySentCount);
        console.log('[API] 新增消息数量:', newMessages.length);

        if (newMessages.length === 0) {
          console.log('[API] 没有新消息需要发送');
          return res.status(400).json({
            error: {
              message: 'No new messages to send',
              type: 'invalid_request_error'
            }
          });
        }

        messagesToSend = this.convertMessagesForExtension(newMessages);

        this.conversationState.set(conversationId, {
          sentCount: messages.length,
          lastSentTime: Date.now()
        });
      }

      console.log('[API] 发送消息数量:', messagesToSend.length);

      const requestData = {
        model: model || config.model,
        messages: messagesToSend,
        tools: null,
        tool_choice: null
      };

      if (stream) {
        await this.handleStreamingResponse(req, res, requestData);
      } else {
        await this.handleNonStreamingResponse(req, res, requestData);
      }

    } catch (error) {
      console.error('Error handling chat completion:', error);

      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message,
            type: 'server_error'
          }
        });
      }
    }
  }

  /**
   * 标准化消息 content 字段
   * 支持字符串格式和多模态数组格式
   */
  normalizeContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text')
        .map(item => item.text || '')
        .join('\n');
    }
    return '';
  }

  extractFirstSentence(text) {
    if (!text || typeof text !== 'string') {
      return 'Untitled';
    }

    const trimmed = text.trim();

    const match = trimmed.match(/^.+?[。！？.!?，,\n]/);
    if (match) {
      let sentence = match[0].trim();
      sentence = sentence.replace(/[。！？.!?，,\n]+$/, '');
      if (sentence.length > 30) {
        return sentence.substring(0, 30) + '...';
      }
      return sentence;
    }

    if (trimmed.length > 30) {
      return trimmed.substring(0, 30) + '...';
    }

    return trimmed;
  }

  sendTitleNonStreamResponse(req, res, title, requestId) {
    const result = {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.body.model || config.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: title
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: Math.ceil(title.length / 4),
        total_tokens: 10 + Math.ceil(title.length / 4)
      }
    };

    console.log('[API] Title generated (non-stream):', title);
    res.json(result);
  }

  async sendTitleStreamResponse(req, res, title, requestId) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const createdTime = Math.floor(Date.now() / 1000);
    const model = req.body.model || config.model;

    await this.streamChunk(res, {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion.chunk',
      created: createdTime,
      model: model,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant'
        }
      }],
      usage: null
    });

    await this.streamChunk(res, {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion.chunk',
      created: createdTime,
      model: model,
      choices: [{
        index: 0,
        delta: {
          content: title
        }
      }],
      usage: null
    });

    const promptTokens = 10;
    const completionTokens = Math.ceil(title.length / 4);

    await this.streamChunk(res, {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion.chunk',
      created: createdTime,
      model: model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        prompt_tokens_details: {
          cached_tokens: 0
        },
        completion_tokens_details: {
          reasoning_tokens: 0,
          accepted_prediction_tokens: 0,
          rejected_prediction_tokens: 0
        }
      }
    });

    console.log('[API] Title generated (stream):', title);
    res.write('data: [DONE]\n\n');
    res.end();
  }

  /**
   * 将标准 OpenAI 消息格式转换为适合发送给插件的格式
   * 所有非 assistant 消息合并成一条 user 消息
   */
  convertMessagesForExtension(messages) {
    const userContents = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        const normalizedContent = this.normalizeContent(msg.content);
        const toolResultText = `[工具执行结果: ${msg.tool_call_id}]\n${normalizedContent}`;
        userContents.push(toolResultText);
      } else if(msg.role=='user'){
        const normalizedContent = this.normalizeContent(msg.content);
        if (normalizedContent) {
          userContents.push(normalizedContent);
        }
      }
    }

    if (userContents.length > 0) {
      return [
        {
          role: 'user',
          content: userContents.join('\n\n')
        }
      ];
    }

    return [];
  }

  async handleNonStreamingResponse(req, res, requestData) {
    try {
      console.log('\n[API] ====== Non-Streaming Response ======');
      const response = await this.messageRouter.sendMessageToExtension(requestData);

      console.log('[API] AI Response content length:', response.content?.length || 0);
      console.log('[API] AI Response preview:', response.content?.substring(0, 200));

      if (response.error) {
        console.error('[API] Response error:', response.content);
        return res.status(500).json({
          error: {
            message: response.content,
            type: 'server_error'
          }
        });
      }

      const toolCalls = this.toolConverter.convertTextToToolCalls(response.content);
      console.log('[API] Parsed tool_calls count:', toolCalls.length);
      if (toolCalls.length > 0) {
        console.log('[API] Tool calls:', JSON.stringify(toolCalls, null, 2));
      }
      
      const result = {
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: requestData.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: toolCalls.length > 0 ? null : response.content,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
          },
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
        }],
        usage: {
          prompt_tokens: this.estimateTokens(requestData.messages),
          completion_tokens: this.estimateTokens([{ content: response.content }]),
          total_tokens: 0
        }
      };
      
      result.usage.total_tokens = result.usage.prompt_tokens + result.usage.completion_tokens;
      
      // 如果创建了新会话，在响应中包含会话 ID
      if (response.conversation_id) {
        result.conversation_id = response.conversation_id;
      }

      console.log('[API] Response result:', JSON.stringify({
        id: result.id,
        finish_reason: result.choices[0].finish_reason,
        has_tool_calls: !!result.choices[0].message.tool_calls,
        tool_calls_count: result.choices[0].message.tool_calls?.length || 0
      }, null, 2));
      console.log('[API] ====== End Non-Streaming ======\n');

      res.json(result);

    } catch (error) {
      console.error('Error in non-streaming response:', error);
      res.status(500).json({
        error: {
          message: error.message,
          type: 'server_error'
        }
      });
    }
  }

  async handleStreamingResponse(req, res, requestData) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      console.log('\n[API] ====== Streaming Response ======');
      const response = await this.messageRouter.sendMessageToExtension({
        ...requestData,
        requestId: requestId
      });

      const content = response.content || '';
      console.log('[API] AI Response content length:', content.length);
      console.log('[API] AI Response preview:', content.substring(0, 200));

      const toolCalls = this.toolConverter.convertTextToToolCalls(content);
      console.log('[API] Parsed tool_calls count:', toolCalls.length);
      if (toolCalls.length > 0) {
        console.log('[API] Tool calls:', JSON.stringify(toolCalls, null, 2));
      }

      const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
      const createdTime = Math.floor(startTime / 1000);
      const model = requestData.model;

      await this.streamChunk(res, {
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: createdTime,
        model: model,
        choices: [{
          index: 0,
          delta: {
            role: 'assistant'
          }
        }],
        usage: null
      });
      console.log('[API] SSE: Sent role delta');

      if (toolCalls.length > 0) {
        for (let i = 0; i < toolCalls.length; i++) {
          const toolCall = toolCalls[i];

          console.log(`[API] SSE: Sending tool_call ${i}:`, {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments_length: toolCall.function.arguments.length
          });

          await this.streamChunk(res, {
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: createdTime,
            model: model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: i,
                  id: toolCall.id,
                  type: toolCall.type,
                  function: {
                    name: toolCall.function.name,
                    arguments: ''
                  }
                }]
              }
            }],
            usage: null
          });
          console.log(`[API] SSE: Sent tool_call ${i} name delta`);

          await this.streamChunk(res, {
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: createdTime,
            model: model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: i,
                  function: {
                    arguments: toolCall.function.arguments
                  }
                }]
              }
            }],
            usage: null
          });
          console.log(`[API] SSE: Sent tool_call ${i} arguments delta (length: ${toolCall.function.arguments.length})`);
        }
      } else if (content) {
        await this.streamChunk(res, {
          id: `chatcmpl-${requestId}`,
          object: 'chat.completion.chunk',
          created: createdTime,
          model: model,
          choices: [{
            index: 0,
            delta: {
              content: content
            }
          }],
          usage: null
        });
      }

      const promptTokens = this.estimateTokens(requestData.messages);
      const completionTokens = this.estimateTokens([{ content: content }]);

      await this.streamChunk(res, {
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: createdTime,
        model: model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: finishReason
        }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          prompt_tokens_details: {
            cached_tokens: 0
          },
          completion_tokens_details: {
            reasoning_tokens: 0,
            accepted_prediction_tokens: 0,
            rejected_prediction_tokens: 0
          }
        }
      });
      console.log('[API] SSE: Sent finish_reason:', finishReason);
      console.log('[API] ====== End Streaming ======\n');

      res.write('data: [DONE]\n\n');

    } catch (error) {
      console.error('Error in streaming response:', error);

      await this.streamChunk(res, {
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: Math.floor(startTime / 1000),
        model: requestData.model,
        choices: [{
          index: 0,
          delta: {
            content: `\n[Error: ${error.message}]`
          }
        }],
        usage: null
      });

      res.write('data: [DONE]\n\n');
    }

    res.end();
  }

  async streamChunk(res, chunk) {
    return new Promise((resolve) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      setImmediate(resolve);
    });
  }

  estimateTokens(messages) {
    let totalChars = 0;

    for (const message of messages) {
      const normalizedContent = this.normalizeContent(message.content);
      totalChars += normalizedContent.length;
    }

    return Math.ceil(totalChars / 4);
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(config.port, () => {
        console.log(`OpenAI API server running on http://localhost:${config.port}`);
        console.log(`Endpoint: http://localhost:${config.port}/v1/chat/completions`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('OpenAI API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = OpenAIAPIServer;
