class ApiMessageSender extends AbstractMessageSender {
  async send(content, options = {}) {
    const { baseUrl, apiKey, model, provider } = options;

    if (!baseUrl || !apiKey) {
      throw new Error('API 模式需要配置 Base URL 和 API Key');
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const requestBody = {
      model: model || 'default',
      messages: Array.isArray(content) ? content : [{ role: 'user', content }],
      stream: false
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      console.log(`\n========== API 请求开始 ==========`);
      console.log(`Provider: ${provider}`);
      console.log(`Model: ${model}`);
      console.log(`URL: ${url}`);
      console.log(`\nCurl 命令:`);
      console.log(`curl -X POST "${url}" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -H "Authorization: Bearer ${apiKey}" \\`);
      console.log(`  -d '${JSON.stringify(requestBody)}'`);
      console.log(`\n请求体:`);
      console.log(JSON.stringify(requestBody, null, 2));
      console.log(`\n验证 Headers:`);
      console.log(`Content-Type: application/json`);
      console.log(`Authorization: Bearer ${apiKey.substring(0, 10)}...${apiKey.substring(Math.max(0, apiKey.length - 5))}`);
      console.log(`API Key 完整长度: ${apiKey.length} 字符`);
      console.log(`===================================\n`);

        const requestHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };

        console.log(`[DEBUG] 实际发送的 headers:`, Object.keys(requestHeaders));

        const response = await fetch(url, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log(`\n响应状态: ${response.status} ${response.statusText}`);

        console.log(`\n响应 Headers:`);
        response.headers.forEach((value, key) => {
          console.log(`  ${key}: ${value}`);
        });

        if (!response.ok) {
          const errorMessages = {
            401: 'API 认证失败，请检查 API Key',
            403: 'API 无权限访问',
            429: 'API 请求频率超限，请稍后重试'
          };

          console.error(`\n========== API 错误详情 ==========`);
          console.error(`状态码: ${response.status}`);
          console.error(`错误类型: ${errorMessages[response.status] || '未知错误'}`);

          if (response.status === 401 || response.status === 403) {
            console.error(`\n🔍 认证错误检查清单:`);
            console.error(`1. API Key 是否正确？`);
            console.error(`2. API Key 是否有访问此模型的权限？`);
            console.error(`3. Base URL 是否正确？`);
            console.error(`4. 模型名称是否正确？`);
            console.error(`\n当前配置:`);
            console.error(`- Base URL: ${baseUrl}`);
            console.error(`- Model: ${model}`);
            console.error(`- API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(Math.max(0, apiKey.length - 5))}`);
            console.error(`===================================\n`);

            throw new Error(errorMessages[response.status]);
          }

          if (response.status >= 500) {
            throw new Error(`API 服务器错误 (${response.status})`);
          }

          throw new Error(errorMessages[response.status] || `API 请求失败 (${response.status})`);
        }

        const data = await response.json();
        const resultContent = data.choices?.[0]?.message?.content || '';

        console.log(`\n响应数据:`);
        console.log(JSON.stringify(data, null, 2));
        console.log(`提取的内容长度: ${resultContent.length} 字符`);
        console.log(`========== API 请求成功 ==========\n`);

        return {
          content: resultContent,
          conversationUrl: null
        };

      } catch (error) {
        console.error(`\n========== API 请求失败 ==========`);
        console.error(`Error: ${error.message}`);
        console.error(`Error type: ${error.name}`);
        if (error.stack) {
          console.error(`Stack trace:`, error.stack);
        }
        console.error(`===================================\n`);

        if (error.name === 'AbortError') {
          throw new Error('API 请求超时（120秒）');
        }
        throw error;
      }
  }
}
