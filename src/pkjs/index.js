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
      sendError(requestId, errorCode, displayMessageForError(errorCode));
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
  var memoryDepth = getMemoryDepth(settings);
  var maxMessages = memoryDepth * 2;
  var recentMessages = maxMessages > 0 ? conversationMemory.slice(-maxMessages) : [];
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
    'Answer for a small smartwatch screen. Keep it under 240 characters. Be direct, practical, and easy to scan. Skip greetings, filler, and markdown unless the user asks for formatting. If uncertain, say so briefly.'
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
  
  return parts.join('\n');
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
