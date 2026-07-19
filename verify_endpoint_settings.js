#!/usr/bin/env node

var assert = require('assert');

var storage = {};
global.localStorage = {
  getItem: function(key) { return storage[key] || null; },
  setItem: function(key, value) { storage[key] = value; }
};
global.btoa = function(value) { return Buffer.from(value, 'utf8').toString('base64'); };

var config = require('./src/pkjs/config');

var openRouter = {
  apiKey: 'openrouter-secret',
  endpointProfile: 'openrouter',
  customBaseUrl: '',
  model: 'openai/gpt-5.4-mini'
};
var sameEndpoint = {
  apiKey: '',
  endpointProfile: 'openrouter',
  customBaseUrl: '',
  model: 'openai/gpt-5.4-mini'
};
var openAi = {
  apiKey: '',
  endpointProfile: 'openai',
  customBaseUrl: '',
  model: 'gpt-5.4-mini'
};
var changedCustomUrl = {
  apiKey: '',
  endpointProfile: 'custom',
  customBaseUrl: 'https://example.test/v1/chat/completions',
  model: '',
  customModelId: 'example-model'
};

assert.strictEqual(config.mergeSavedSettings(openRouter, sameEndpoint).apiKey, 'openrouter-secret');
assert.strictEqual(config.mergeSavedSettings(openRouter, openAi).apiKey, '');
assert.strictEqual(config.mergeSavedSettings({ apiKey: 'custom-secret', endpointProfile: 'custom', customBaseUrl: 'https://old.test/v1/chat/completions' }, changedCustomUrl).apiKey, '');

var configUrl = config.getConfigPageUrl(openRouter);
var pageSettings = JSON.parse(decodeURIComponent(configUrl.slice(configUrl.indexOf('#') + 1)));
assert.strictEqual(pageSettings.apiKey, undefined);
assert.strictEqual(pageSettings.hasApiKey, true);

var page = require('./src/pkjs/config_page');
assert(page.indexOf('profile === initialProfile ? (settings.model || defaultModel(profile)) : defaultModel(profile)') !== -1);
assert(page.indexOf('if (endpointChanged && !apiKeyValue)') !== -1);
assert(page.indexOf('document.getElementById("customModelId").value = ""') !== -1);

console.log('Endpoint settings verification passed.');
