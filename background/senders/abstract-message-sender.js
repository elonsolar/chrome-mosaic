class AbstractMessageSender {
  async send(content, options) {
    throw new Error('AbstractMessageSender: send() must be implemented by subclass');
  }

  postProcessResponse(content) {
    if (!content) return '';
    const endMarker = '[[<<>>]]';
    if (content.endsWith(endMarker)) {
      content = content.slice(0, -endMarker.length).trim();
    }
    return content;
  }
}
