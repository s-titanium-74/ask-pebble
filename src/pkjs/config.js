var localStorageKey = 'ask_pebbpe_settings';

var defaultSettings = {
  apiKey: '',
  language: 'Auto',
  model: 'openai/gpt-oss-20b',
  customModelId: '',
  systemInstruction: '',
  maxOutputTokens: '300',
  memoryDepth: '2',
  timeoutSeconds: '12',
  includeTimeContext: true,
  includeLocationContext: false,
  includeHealthContext: false
};

module.exports = {
  hasApiKey: function() {
    var settings = this.getSettings();
    return !!(settings.apiKey && settings.apiKey.length > 0);
  },
  
  getSettings: function() {
    try {
      var stored = localStorage.getItem(localStorageKey);
      if (stored) {
        var parsed = JSON.parse(stored);
        // Merge with defaults
        var settings = {};
        for (var key in defaultSettings) {
          settings[key] = parsed[key] !== undefined ? parsed[key] : defaultSettings[key];
        }
        return settings;
      }
    } catch (e) {
      console.log('Error parsing settings: ' + e);
    }
    return defaultSettings;
  },
  
  saveSettings: function(settings) {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(settings));
    } catch (e) {
      console.log('Error saving settings: ' + e);
    }
  },
  
  getApiKey: function() {
    return this.getSettings().apiKey;
  },
  
  getModel: function() {
    var settings = this.getSettings();
    if (settings.customModelId && settings.customModelId.length > 0) {
      return settings.customModelId;
    }
    return settings.model || defaultSettings.model;
  },
  
  deleteApiKey: function() {
    var settings = this.getSettings();
    settings.apiKey = '';
    this.saveSettings(settings);
  },
  
  getConfigPageUrl: function(settings) {
    // Return data URI for embedded config page with settings hash
    var base64Html = btoa(require('./config_page'));
    var url = 'data:text/html;base64,' + base64Html;
    if (settings) {
      url += '#' + encodeURIComponent(JSON.stringify(settings));
    }
    return url;
  }
};
