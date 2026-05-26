class ExpertEntity extends BaseEntity {
  constructor(flowData, flowExecutor, progressNotifier) {
    super(
      flowData.id,
      flowData.name,
      'expert'
    );

    this.flowData = flowData;
    this.flowExecutor = flowExecutor;
    this.progressNotifier = progressNotifier;
  }

  async validate(input, context) {
    if (!this.flowData || !this.flowData.nodes) {
      return { valid: false, error: '流程数据无效' };
    }

    if (!input || input.trim().length === 0) {
      return { valid: false, error: '输入内容为空' };
    }

    return { valid: true, error: null };
  }

  async execute(input, context) {
    console.log(`[ExpertEntity] ${this.name} 开始执行流程`);

    try {
      this.reportProgress({
        type: 'progress',
        message: '开始执行流程...'
      });

      const result = await this.flowExecutor.executeFlow(
        this.flowData,
        input,
        {
          onProgress: (progress) => {
            this.reportProgress({
              type: 'progress',
              nodeName: progress.nodeName,
              nodeId: progress.nodeId,
              message: `执行节点: ${progress.nodeName || '未知'} (${progress.current || 0}/${progress.total || 0})`
            });

            this.progressNotifier.notify(context.conversationId, progress);
          }
        }
      );

      this.reportProgress({
        type: 'progress',
        message: '执行完成'
      });

      if (!result || !result.content) {
        throw new Error('流程执行返回无效结果');
      }

      return {
        success: true,
        content: result.content,
        expertId: this.id,
        expertName: this.name,
        metadata: result.metadata,
        timestamp: Date.now()
      };

    } catch (error) {
      this.reportProgress({
        type: 'error',
        message: `错误: ${error.message}`
      });

      return {
        success: false,
        content: '',
        error: error.message,
        expertId: this.id,
        expertName: this.name,
        timestamp: Date.now()
      };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExpertEntity;
}
