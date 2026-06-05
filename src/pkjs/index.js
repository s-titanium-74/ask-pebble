var config = require('./config');
var openrouter = require('./openrouter');

// State
var currentRequestId = null;
var currentRequest = null;
var canceledRequestIds = {};
var conversationMemory = [];

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
    
    // Preserve existing API key if user cleared the input
    if (!newSettings.apiKey && oldSettings.apiKey) {
      newSettings.apiKey = oldSettings.apiKey;
    }
    
    config.saveSettings(newSettings);
    
    // API key explicitly deleted: clear conversation memory
    if (oldSettings.apiKey && !newSettings.apiKey) {
      conversationMemory = [];
    }
    
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
  var messages = buildMessages(utterance, settings);
  
  currentRequest = openrouter.request({
    apiKey: settings.apiKey,
    model: config.getModel(),
    messages: messages,
    maxTokens: parseInt(settings.maxOutputTokens) || 300,
    timeout: (parseInt(settings.timeoutSeconds) || 12) * 1000
  }, function(error, response) {
    currentRequest = null;
    
    // Check if request was canceled
    if (canceledRequestIds[requestId]) {
      delete canceledRequestIds[requestId];
      return;
    }
    
    if (error) {
      var errorCode = mapOpenRouterError(error);
      sendError(requestId, errorCode, error.message);
      return;
    }
    
    var answer = extractAnswer(response);
    var shortenedAnswer = truncateAnswer(answer, 240, 768);
    
    // Add to memory
    addToMemory(utterance, shortenedAnswer);
    
    sendAnswer(requestId, shortenedAnswer);
  });
}

function handleCancel(requestId) {
  canceledRequestIds[requestId] = true;
  if (currentRequest && currentRequest.abort) {
    currentRequest.abort();
    currentRequest = null;
  }
}

// Helpers
function buildMessages(utterance, settings) {
  var messages = [];
  
  // System instruction
  var systemInstruction = buildSystemInstruction(settings);
  messages.push({
    role: 'system',
    content: systemInstruction
  });
  
  // Conversation memory
  var memoryDepth = parseInt(settings.memoryDepth) || 2;
  var recentMessages = conversationMemory.slice(-memoryDepth * 2);
  recentMessages.forEach(function(msg) {
    messages.push(msg);
  });
  
  // User message
  messages.push({
    role: 'user',
    content: utterance
  });
  
  return messages;
}

function buildSystemInstruction(settings) {
  var parts = [
    'Answer for a small smartwatch screen. Be concise, practical, and keep it under 240 characters.'
  ];
  
  var language = settings.language || 'Japanese';
  if (language === 'Japanese') {
    parts.push('Answer in Japanese.');
  } else if (language === 'English') {
    parts.push('Answer in English.');
  } else if (language === 'Auto') {
    parts.push('Detect the user\'s language from the message and answer in the same language.');
  }
  
  if (settings.systemInstruction) {
    parts.push(settings.systemInstruction);
  }
  
  return parts.join('\n');
}

function addToMemory(utterance, answer) {
  var memoryDepth = parseInt(config.getSettings().memoryDepth) || 2;
  var maxMessages = memoryDepth * 2;
  
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

function truncateAnswer(answer, maxChars, maxBytes) {
  if (!answer) return '';
  
  // Truncate by character count first
  var truncated = answer;
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
    return response.choices[0].message.content;
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
