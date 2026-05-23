class ApiMessageSender extends AbstractMessageSender {
  async send(content, options = {}) {
    const { baseUrl, apiKey, model } = options;

    if (!baseUrl || !apiKey) {
      throw new Error('API 模式需要配置 Base URL 和 API Key');
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'default',
            messages: Array.isArray(content) ? content : [{ role: 'user', content }],
            stream: false
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorMessages = {
            401: 'API 认证失败，请检查 API Key',
            403: 'API 无权限访问',
            429: 'API 请求频率超限，请稍后重试'
          };

          if (response.status === 401 || response.status === 403) {
            throw new Error(errorMessages[response.status]);
          }

          if (response.status >= 500) {
            throw new Error(`API 服务器错误 (${response.status})`);
          }

          throw new Error(errorMessages[response.status] || `API 请求失败 (${response.status})`);
        }

        const data = await response.json();
        const resultContent = data.choices?.[0]?.message?.content || '';

        return {
          content: this.postProcessResponse(resultContent),
          conversationUrl: null
        };

      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          throw new Error('API 请求超时（120秒）');
        }
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[ApiMessageSender] 第${attempt}次尝试失败，${delay / 1000}秒后重试:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('API 请求失败');
  }
}
