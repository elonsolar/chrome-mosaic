/**
 * FlowTestRunner - 流程试运行执行器
 * 职责：委托给 FlowExecutor 执行流程试运行
 */

class FlowTestRunner {
  constructor(conversationManager, senderFactory, flowExecutor) {
    this.conversationManager = conversationManager;
    this.senderFactory = senderFactory;
    this.flowExecutor = flowExecutor;
    this.executionContext = new Map();
  }

  async testRunFlow(flowData, startNodeInputs = {}, onProgress = null) {
    console.log('[FlowTestRunner] 执行流程（委托给 FlowExecutor）');

    const result = await this.flowExecutor.execute(flowData, startNodeInputs, onProgress);

    return result;
  }
}

if (typeof self !== 'undefined') {
  self.FlowTestRunner = FlowTestRunner;
}
