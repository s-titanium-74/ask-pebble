#!/usr/bin/env node

var assert = require('assert');
var vm = require('vm');

var storage = {};
global.localStorage = {
  getItem: function(key) { return storage[key] || null; },
  setItem: function(key, value) { storage[key] = value; }
};
global.btoa = function(value) {
  if (/[^\x00-\xff]/.test(value)) throw new Error('InvalidCharacterError');
  return Buffer.from(value, 'latin1').toString('base64');
};

var config = require('./src/pkjs/config');

var openRouter = {
  apiKey: 'openrouter-secret',
  endpointProfile: 'openrouter',
  customBaseUrl: '',
  model: 'openai/gpt-5.4-mini',
  customModelId: '',
  language: 'Auto',
  systemInstruction: '',
  includeTimeContext: true,
  includeLocationContext: false,
  includeHealthContext: false,
  maxOutputTokens: '300',
  memoryDepth: '2',
  timeoutSeconds: '12'
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
assert.strictEqual(configUrl.indexOf('openrouter-secret'), -1);
assert(configUrl.length < 10000, 'Local configuration URL exceeds 10,000 characters: ' + configUrl.length);

var customUrl = config.getConfigPageUrl({
  apiKey: 'custom-secret',
  endpointProfile: 'custom',
  customBaseUrl: 'https://example.test/v1/chat/completions',
  model: '',
  customModelId: 'example-model',
  language: 'Japanese',
  systemInstruction: 'Answer concisely and include one practical next action.',
  includeTimeContext: true,
  includeLocationContext: true,
  includeHealthContext: true,
  maxOutputTokens: '512',
  memoryDepth: '3',
  timeoutSeconds: '20'
});
assert(customUrl.length < 10000, 'Custom configuration URL exceeds 10,000 characters: ' + customUrl.length);
assert.strictEqual(customUrl.indexOf('custom-secret'), -1);

var page = require('./src/pkjs/config_page');
assert(/^[\x00-\x7f]*$/.test(page), 'Configuration page must remain ASCII-safe for btoa()');
var script = page.match(/<script>([\s\S]*)<\/script>/);
assert(script, 'Configuration page script is missing');
assert.doesNotThrow(function() { new Function(script[1]); });
assert(page.indexOf('p===initial?(S.model||defaultModel(p)):defaultModel(p)') !== -1);
assert(page.indexOf('if(changed&&!key)') !== -1);
assert(page.indexOf('if(changed&&p!=="custom")customModel=""') !== -1);
assert(page.indexOf('id="endpoint"') === -1, 'Compact DOM ids were replaced with verbose ids');

var elements = {};
var elementPattern = /<[^>]+id="([^"]+)"[^>]*>/g;
var match;
while ((match = elementPattern.exec(page))) {
  var classMatch = match[0].match(/class="([^"]*)"/);
  elements[match[1]] = {
    value: '',
    checked: false,
    className: classMatch ? classMatch[1] : '',
    textContent: '',
    placeholder: '',
    innerHTML: '',
    children: [],
    appendChild: function(child) {
      this.children.push(child);
      if (child.selected) this.value = child.value;
    }
  };
}
elements.e.value = 'openrouter';
elements.l.value = 'Auto';
elements.x.value = '300';
elements.d.value = '2';
elements.o.value = '12';

var alerts = [];
var browser = {
  document: {
    getElementById: function(id) { return elements[id]; },
    createElement: function() { return { value: '', text: '', selected: false }; }
  },
  location: { hash: configUrl.slice(configUrl.indexOf('#')), href: '' },
  window: { open: function() {} },
  confirm: function() { return true; },
  alert: function(message) { alerts.push(message); },
  JSON: JSON,
  decodeURIComponent: decodeURIComponent,
  encodeURIComponent: encodeURIComponent
};
vm.runInNewContext(script[1], browser);
assert.strictEqual(elements.ks.className, 'status');
assert.strictEqual(elements.m.value, 'openai/gpt-5.4-mini');
assert.strictEqual(elements.t.checked, true);

elements.e.value = 'custom';
browser.endpointUI();
assert.strictEqual(elements.ur.className, '');
assert.strictEqual(elements.mr.className, 'hide');
elements.u.value = 'https://example.test/v1/chat/completions';
elements.cm.value = 'example-model';
browser.save();
assert.strictEqual(alerts.pop(), 'Enter an API key for the selected endpoint.');
elements.k.value = 'new-custom-secret';
browser.save();
var saved = JSON.parse(decodeURIComponent(browser.location.href.split('#')[1]));
assert.strictEqual(saved.endpointProfile, 'custom');
assert.strictEqual(saved.customBaseUrl, 'https://example.test/v1/chat/completions');
assert.strictEqual(saved.customModelId, 'example-model');
assert.strictEqual(saved.apiKey, 'new-custom-secret');

console.log('Endpoint settings verification passed. URL lengths: default=' + configUrl.length + ', custom=' + customUrl.length);
