var localStorageKey = 'ask_pebble_settings';

var endpointUrls = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions'
};

var defaultSettings = {
  apiKey: '',
  endpointProfile: 'openrouter',
  customBaseUrl: '',
  language: 'Auto',
  model: 'openai/gpt-5.4-mini',
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

  getBaseUrl: function(settings) {
    settings = settings || this.getSettings();
    if (settings.endpointProfile === 'openai') {
      return endpointUrls.openai;
    }
    if (settings.endpointProfile === 'custom') {
      return settings.customBaseUrl || '';
    }
    return endpointUrls.openrouter;
  },

  getEndpointIdentity: function(settings) {
    settings = settings || this.getSettings();
    var profile = settings.endpointProfile || defaultSettings.endpointProfile;
    if (profile === 'custom') {
      return 'custom:' + (settings.customBaseUrl || '').trim();
    }
    return profile;
  },

  shouldPreserveApiKey: function(oldSettings, newSettings) {
    return this.getEndpointIdentity(oldSettings) === this.getEndpointIdentity(newSettings);
  },

  mergeSavedSettings: function(oldSettings, newSettings) {
    if (newSettings.apiKeyDeleted) {
      newSettings.apiKey = '';
    } else if (!newSettings.apiKey && oldSettings.apiKey && this.shouldPreserveApiKey(oldSettings, newSettings)) {
      newSettings.apiKey = oldSettings.apiKey;
    }
    return newSettings;
  },

  deleteApiKey: function() {
    var settings = this.getSettings();
    settings.apiKey = '';
    this.saveSettings(settings);
  },

  getConfigPageUrl: function(settings) {
    var base64Html = btoa(require('./config_page'));
    var url = 'data:text/html;base64,' + base64Html;
    if (settings) {
      var pageSettings = {};
      for (var key in settings) {
        if (key !== 'apiKey') {
          pageSettings[key] = settings[key];
        }
      }
      pageSettings.hasApiKey = !!settings.apiKey;
      url += '#' + encodeURIComponent(JSON.stringify(pageSettings));
    }
    return url;
  }
};
