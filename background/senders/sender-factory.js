class SenderFactory {
  constructor(tabManager, pendingResponses) {
    this.webSender = new WebMessageSender(tabManager, pendingResponses);
    this.apiSender = new ApiMessageSender();
  }

  getSender(accessMethod) {
    if (accessMethod === 'api') {
      return this.apiSender;
    }
    return this.webSender;
  }
}
