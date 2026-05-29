class AbstractMessageSender {
  async send(content, options) {
    throw new Error('AbstractMessageSender: send() must be implemented by subclass');
  }
}
