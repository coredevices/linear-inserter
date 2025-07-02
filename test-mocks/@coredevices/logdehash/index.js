// Mock for @coredevices/logdehash - used only in CI testing
class LogDehash {
  constructor(dicts) {
    this.dicts = dicts || [];
  }
  
  dehash(line) {
    // Simple mock implementation
    return `dehashed: ${line}`;
  }
}

module.exports = LogDehash;
module.exports.default = LogDehash;