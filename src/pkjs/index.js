var config = require('./config');
var openrouter = require('./openrouter');

// State
var currentRequestId = null;
var currentRequest = null;
var canceledRequestIds = {};
var conversationMemory = [];
var pendingHealthRequests = {};

// AppMessage handlers
Pebble.addEventListener('ready', function(e) {
  console.log('PebbleKit JS ready');
});

Pebble.addEventListener('appmessage', function(e) {
  var payload = e.payload;
  var type = payload.type;
  var requestId = payload.requestId;
  
  if (type === 'key_state') {
    handleKeyState(requestId);
  } else if (type === 'ask') {
    handleAsk(requestId, payload.utterance);
  } else if (type === 'cancel') {
    handleCancel(requestId);
  } else if (type === 'health_context') {
    handleHealthContext(requestId, payload);
  }
});

Pebble.addEventListener('showConfiguration', function(e) {
  var url = config.getConfigPageUrl(config.getSettings());
  Pebble.openURL(url);
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e.response && e.response !== 'CANCELLED') {
    var newSettings = JSON.parse(decodeURIComponent(e.response));
    var oldSettings = config.getSettings();
    
    if (newSettings.apiKeyDeleted) {
      newSettings.apiKey = '';
      conversationMemory = [];
    } else if (!newSettings.apiKey && oldSettings.apiKey) {
      // Preserve existing API key if the masked input was left blank.
      newSettings.apiKey = oldSettings.apiKey;
    }
    
    config.saveSettings(newSettings);
    
    // Memory reset requested
    if (newSettings.memoryReset) {
      conversationMemory = [];
    }
  }
});

// Handlers
function handleKeyState(requestId) {
  var hasKey = config.hasApiKey();
  sendKeyState(hasKey, requestId);
}

function handleAsk(requestId, utterance) {
  currentRequestId = requestId;
  
  if (!config.hasApiKey()) {
    sendError(requestId, 'missing_api_key', 'Set API key');
    return;
  }
  
  var settings = config.getSettings();
  callModel(requestId, utterance, settings, null, true, function(error, answer) {
    if (error) {
      var errorCode = mapOpenRouterError(error);
      sendError(requestId, errorCode, displayMessageForError(errorCode));
      return;
    }

    var toolParse = parseToolRequest(answer, getAvailableTools(settings));
    console.log('First LLM response for requestId ' + requestId + ': hasJson=' + toolParse.hasJson + ', hasToolRequest=' + !!toolParse.request);
    if (!toolParse.hasJson) {
      finishAnswer(requestId, utterance, answer);
      return;
    }

    if (!toolParse.request) {
      callPlainAnswer(requestId, utterance, settings);
      return;
    }

    handleToolRequest(requestId, utterance, settings, toolParse.request, answer);
  });
}

function callPlainAnswer(requestId, utterance, settings) {
  callModel(requestId, utterance, settings, null, false, true, function(error, answer) {
    if (error) {
      var errorCode = mapOpenRouterError(error);
      sendError(requestId, errorCode, displayMessageForError(errorCode));
      return;
    }
    finishAnswer(requestId, utterance, answer);
  });
}

function handleToolRequest(requestId, utterance, settings, toolRequest, firstAnswer) {
  collectToolContext(requestId, toolRequest, settings, function(contextText) {
      console.log('Collected context for requestId ' + requestId + ': ' + (contextText ? contextText : 'none'));
      if (canceledRequestIds[requestId]) {
        delete canceledRequestIds[requestId];
        return;
      }

      callModel(requestId, utterance, settings, contextText, false, true, function(secondError, secondAnswer) {
        if (secondError) {
          var secondErrorCode = mapOpenRouterError(secondError);
          sendError(requestId, secondErrorCode, displayMessageForError(secondErrorCode));
          return;
        }
        finishAnswer(requestId, utterance, secondAnswer);
      });
  });
}

function handleCancel(requestId) {
  canceledRequestIds[requestId] = true;
  if (currentRequest && currentRequest.abort) {
    currentRequest.abort();
    currentRequest = null;
  }
  if (pendingHealthRequests[requestId]) {
    pendingHealthRequests[requestId]({ available: false });
    delete pendingHealthRequests[requestId];
  }
}

function handleHealthContext(requestId, payload) {
  if (pendingHealthRequests[requestId]) {
    pendingHealthRequests[requestId](payload);
    delete pendingHealthRequests[requestId];
  }
}

// Helpers
function callModel(requestId, utterance, settings, contextText, includeToolInstructions, includeBaseContext, callback) {
  if (typeof includeBaseContext === 'function') {
    callback = includeBaseContext;
    includeBaseContext = true;
  }
  var messages = buildMessages(utterance, settings, contextText, includeToolInstructions, includeBaseContext !== false);
  console.log('Calling LLM requestId=' + requestId + ', toolInstructions=' + !!includeToolInstructions + ', context=' + !!contextText + ', baseContext=' + (includeBaseContext !== false));

  currentRequest = openrouter.request({
    apiKey: settings.apiKey,
    endpointProfile: settings.endpointProfile,
    baseUrl: config.getBaseUrl(settings),
    model: config.getModel(),
    messages: messages,
    maxTokens: parseInt(settings.maxOutputTokens) || 300,
    timeout: (parseInt(settings.timeoutSeconds) || 12) * 1000
  }, function(error, response) {
    currentRequest = null;

    if (canceledRequestIds[requestId]) {
      delete canceledRequestIds[requestId];
      return;
    }

    if (error) {
      callback(error);
      return;
    }

    var answer = extractAnswer(response);
    if (!answer) {
      logEmptyResponse(response);
      callback({ code: 'EMPTY_RESPONSE', message: 'Empty answer', status: 0, response: response });
      return;
    }

    callback(null, answer);
  });
}

function logEmptyResponse(response) {
  try {
    var choice = response && response.choices && response.choices.length > 0 ? response.choices[0] : null;
    var finishReason = choice && choice.finish_reason ? choice.finish_reason : 'unknown';
    var contentType = choice && choice.message ? typeof choice.message.content : 'none';
    console.log('Empty LLM response: finish_reason=' + finishReason + ', content_type=' + contentType);
  } catch (e) {
    console.log('Empty LLM response');
  }
}

function finishAnswer(requestId, utterance, answer) {
  var shortenedAnswer = truncateAnswer(answer, 240, 768);
  if (!shortenedAnswer) {
    sendError(requestId, 'provider_failed', 'AI failed');
    return;
  }
  addToMemory(utterance, shortenedAnswer);
  sendAnswer(requestId, shortenedAnswer);
}

function buildMessages(utterance, settings, contextText, includeToolInstructions, includeBaseContext) {
  var messages = [];
  
  // System instruction
  var systemInstruction = buildSystemInstruction(settings, includeToolInstructions);
  messages.push({
    role: 'system',
    content: systemInstruction
  });
  
  // Conversation memory
  var memoryDepth = getMemoryDepth(settings);
  var maxMessages = memoryDepth * 2;
  var recentMessages = maxMessages > 0 ? conversationMemory.slice(-maxMessages) : [];
  recentMessages.forEach(function(msg) {
    messages.push(msg);
  });

  var userContent = utterance;
  var baseContext = includeBaseContext === false ? '' : buildBaseContext(settings);
  var combinedContext = joinContextParts([baseContext, contextText]);
  if (combinedContext) {
    userContent = 'Device context:\n' + combinedContext + '\n\nUser question:\n' + utterance;
  }

  messages.push({
    role: 'user',
    content: userContent
  });
  
  return messages;
}

function buildSystemInstruction(settings, includeToolInstructions) {
  var parts = [
    'Answer for a small smartwatch screen. Keep it under 240 characters. Be direct, practical, and easy to scan. The user message is speech-to-text dictation, so infer the intended meaning despite recognition errors, missing punctuation, or unstable wording. If asked your name, answer Pebble. Skip greetings, filler, and markdown unless the user asks for formatting. If uncertain, say so briefly.'
  ];
  
  var language = settings.language || 'Auto';
  var languageInstructions = {
    'Japanese': 'Answer in Japanese.',
    'English': 'Answer in English.',
    'Chinese (Simplified)': 'Answer in Simplified Chinese.',
    'Chinese (Traditional)': 'Answer in Traditional Chinese.',
    'Korean': 'Answer in Korean.',
    'Spanish': 'Answer in Spanish.',
    'French': 'Answer in French.',
    'German': 'Answer in German.',
    'Portuguese': 'Answer in Portuguese.',
    'Italian': 'Answer in Italian.',
    'Russian': 'Answer in Russian.',
    'Arabic': 'Answer in Arabic.',
    'Hindi': 'Answer in Hindi.'
  };
  if (language === 'Auto') {
    parts.push('Detect the user\'s language from the message and answer in the same language.');
  } else if (languageInstructions[language]) {
    parts.push(languageInstructions[language]);
  }
  
  if (settings.systemInstruction) {
    parts.push(settings.systemInstruction);
  }

  if (includeToolInstructions) {
    var tools = getAvailableTools(settings);
    if (tools.length > 0) {
      parts.push('If answering requires unavailable device context, respond only with JSON in this exact shape: {"tools":["location","health"],"reason":"brief"}. Use only these tools if needed: ' + tools.join(', ') + '. You may request multiple tools. If no tool is needed, answer normally without JSON.');
    }
  } else {
    parts.push('Use any Device context in the user message. Do not return tool JSON.');
  }
  
  return parts.join('\n');
}

function buildBaseContext(settings) {
  if (settings.includeTimeContext === false) {
    return '';
  }
  return getTimeContext();
}

function getTimeContext() {
  var now = new Date();
  var timezone = 'local';
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
    }
  } catch (e) {}
  return 'Time: ' + formatLocalDateTime(now) + ', ' + timezone;
}

function formatLocalDateTime(date) {
  function pad(value) {
    return value < 10 ? '0' + value : '' + value;
  }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function getAvailableTools(settings) {
  var tools = [];
  if (settings.includeTimeContext !== false) {
    tools.push('time');
  }
  if (settings.includeLocationContext === true) {
    tools.push('location');
  }
  if (settings.includeHealthContext === true) {
    tools.push('health');
  }
  return tools;
}

function parseToolRequest(answer, availableTools) {
  var jsonText = extractJsonText(answer || '');
  if (!jsonText) {
    return { hasJson: false, request: null };
  }

  try {
    var parsed = JSON.parse(jsonText);
    if (!parsed || Object.prototype.toString.call(parsed.tools) !== '[object Array]') {
      return { hasJson: true, request: null };
    }

    var allowed = {};
    availableTools.forEach(function(tool) {
      allowed[tool] = true;
    });

    var deduped = [];
    for (var i = 0; i < parsed.tools.length; i++) {
      var toolName = parsed.tools[i];
      if (typeof toolName !== 'string' || !allowed[toolName]) {
        return { hasJson: true, request: null };
      }
      if (deduped.indexOf(toolName) === -1) {
        deduped.push(toolName);
      }
    }

    if (deduped.length === 0) {
      return { hasJson: true, request: null };
    }

    return {
      hasJson: true,
      request: {
        tools: deduped,
        reason: typeof parsed.reason === 'string' ? parsed.reason : ''
      }
    };
  } catch (e) {
    return { hasJson: true, request: null };
  }
}

function extractJsonText(text) {
  var start = -1;
  for (var i = 0; i < text.length; i++) {
    if (text.charAt(i) === '{' || text.charAt(i) === '[') {
      start = i;
      break;
    }
  }
  if (start === -1) {
    return '';
  }

  var openChar = text.charAt(start);
  var closeChar = openChar === '{' ? '}' : ']';
  var depth = 0;
  var inString = false;
  var escaped = false;
  for (var j = start; j < text.length; j++) {
    var ch = text.charAt(j);
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return text.substring(start, j + 1);
      }
    }
  }
  return text.substring(start);
}

function collectToolContext(requestId, toolRequest, settings, callback) {
  if (!toolRequest || !toolRequest.tools || toolRequest.tools.length === 0) {
    callback('');
    return;
  }

  var pending = toolRequest.tools.length;
  var parts = [];
  function done(part) {
    if (part) {
      parts.push(part);
    }
    pending--;
    if (pending === 0) {
      callback(joinContextParts(parts));
    }
  }

  toolRequest.tools.forEach(function(toolName) {
    if (toolName === 'time') {
      done(getTimeContext());
    } else if (toolName === 'location') {
      getLocationContext(done);
    } else if (toolName === 'health') {
      getHealthContext(requestId, done);
    } else {
      done('');
    }
  });
}

function getLocationContext(callback) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    callback('');
    return;
  }

  navigator.geolocation.getCurrentPosition(function(position) {
    if (!position || !position.coords) {
      callback('');
      return;
    }
    callback('Location: lat=' + roundCoord(position.coords.latitude) + ', lon=' + roundCoord(position.coords.longitude));
  }, function() {
    callback('');
  }, {
    enableHighAccuracy: false,
    timeout: 2500,
    maximumAge: 1800000
  });
}

function roundCoord(value) {
  return Math.round(value * 10000) / 10000;
}

function getHealthContext(requestId, callback) {
  var finished = false;
  var timeout = setTimeout(function() {
    if (finished) return;
    finished = true;
    delete pendingHealthRequests[requestId];
    callback('');
  }, 2500);

  pendingHealthRequests[requestId] = function(payload) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    console.log('Received health_context for requestId ' + requestId + ': available=' + !!(payload && payload.healthAvailable));
    callback(formatHealthContext(payload));
  };

  Pebble.sendAppMessage({
    type: 'health_context',
    requestId: requestId
  }, function() {
    console.log('Sent health_context request');
  }, function() {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    delete pendingHealthRequests[requestId];
    callback('');
  });
}

function formatHealthContext(payload) {
  if (!payload || !payload.healthAvailable) {
    return '';
  }

  var parts = [];
  appendMetric(parts, 'stepsToday', payload.stepsToday);
  appendMetric(parts, 'activeMinutesToday', payload.activeMinutesToday);
  appendMetric(parts, 'sleepTodayMinutes', payload.sleepTodayMinutes);
  appendMetric(parts, 'restfulSleepTodayMinutes', payload.restfulSleepTodayMinutes);
  return parts.length > 0 ? 'Health: ' + parts.join(', ') : '';
}

function appendMetric(parts, name, value) {
  if (value !== undefined && value !== null) {
    parts.push(name + '=' + value);
  }
}

function joinContextParts(parts) {
  var clean = [];
  parts.forEach(function(part) {
    if (part && part.length > 0 && clean.indexOf(part) === -1) {
      clean.push(part);
    }
  });
  return clean.join('\n');
}

function addToMemory(utterance, answer) {
  var memoryDepth = getMemoryDepth(config.getSettings());
  var maxMessages = memoryDepth * 2;

  if (maxMessages === 0) {
    conversationMemory = [];
    return;
  }
  
  conversationMemory.push({
    role: 'user',
    content: utterance
  });
  conversationMemory.push({
    role: 'assistant',
    content: answer
  });
  
  // Trim to max
  if (conversationMemory.length > maxMessages) {
    conversationMemory = conversationMemory.slice(-maxMessages);
  }
}

function getMemoryDepth(settings) {
  var memoryDepth = parseInt(settings.memoryDepth);
  if (isNaN(memoryDepth)) {
    return 2;
  }
  return Math.max(0, memoryDepth);
}

function truncateAnswer(answer, maxChars, maxBytes) {
  if (!answer) return '';
  
  // Truncate by character count first
  var truncated = ('' + answer).replace(/^\s+|\s+$/g, '');
  if (!truncated) return '';

  if (truncated.length > maxChars) {
    truncated = truncated.substring(0, maxChars - 3) + '...';
  }
  
  // Then check byte size
  var bytes = new Blob([truncated]).size;
  while (bytes > maxBytes && truncated.length > 3) {
    truncated = truncated.substring(0, truncated.length - 4) + '...';
    bytes = new Blob([truncated]).size;
  }
  
  return truncated;
}

function extractAnswer(response) {
  if (response && response.choices && response.choices.length > 0) {
    var message = response.choices[0].message;
    if (!message) {
      return '';
    }
    var content = message.content;
    if (typeof content === 'string') {
      return content.replace(/^\s+|\s+$/g, '');
    }
    if (Object.prototype.toString.call(content) === '[object Array]') {
      var parts = [];
      content.forEach(function(part) {
        if (typeof part === 'string') {
          parts.push(part);
        } else if (part && typeof part.text === 'string') {
          parts.push(part.text);
        }
      });
      return parts.join('').replace(/^\s+|\s+$/g, '');
    }
  }
  return '';
}

function mapOpenRouterError(error) {
  if (error.status === 401 || error.status === 403) {
    return 'auth_failed';
  }
  if (error.status === 429) {
    return 'rate_limited';
  }
  if (error.status === 402) {
    return 'rate_limited';
  }
  if (error.status === 400) {
    if (error.message && error.message.indexOf('model') !== -1) {
      return 'model_failed';
    }
    return 'provider_failed';
  }
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return 'provider_failed';
  }
  if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
    return error.code === 'TIMEOUT' ? 'timeout' : 'network_failed';
  }
  return 'provider_failed';
}

function displayMessageForError(errorCode) {
  var messages = {
    missing_api_key: 'Set API key',
    auth_failed: 'Check API key',
    model_failed: 'Check model',
    rate_limited: 'Limit reached',
    network_failed: 'Connection failed',
    timeout: 'Timed out',
    provider_failed: 'AI failed'
  };
  return messages[errorCode] || messages.provider_failed;
}

// AppMessage senders
function sendKeyState(hasKey, requestId) {
  var payload = {
    type: 'key_state',
    requestId: requestId || 0,
    status: 'ok',
    hasApiKey: hasKey ? 1 : 0
  };
  Pebble.sendAppMessage(payload, function(e) {
    console.log('Sent key_state');
  }, function(e) {
    console.log('Failed to send key_state');
  });
}

function sendAnswer(requestId, answer) {
  var payload = {
    type: 'answer',
    requestId: requestId,
    status: 'ok',
    answer: answer
  };
  Pebble.sendAppMessage(payload, function(e) {
    console.log('Sent answer for requestId: ' + requestId);
  }, function(e) {
    console.log('Failed to send answer');
  });
}

function sendError(requestId, errorCode, message) {
  var payload = {
    type: 'error',
    requestId: requestId,
    status: 'error',
    errorCode: errorCode,
    message: message
  };
  Pebble.sendAppMessage(payload, function(e) {
    console.log('Sent error for requestId: ' + requestId);
  }, function(e) {
    console.log('Failed to send error');
  });
}
