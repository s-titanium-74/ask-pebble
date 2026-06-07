var xhrRequest = function (url, method, headers, body, timeout, callback) {
  var request = new XMLHttpRequest();
  request.timeout = timeout || 12000;
  
  request.onload = function() {
    if (request.status >= 200 && request.status < 300) {
      try {
        var response = JSON.parse(request.responseText);
        callback(null, response);
      } catch (e) {
        callback({ code: 'PARSE_ERROR', message: 'Invalid JSON response', status: request.status }, null);
      }
    } else {
      var errorMessage = 'Request failed';
      try {
        var errorResponse = JSON.parse(request.responseText);
        errorMessage = errorResponse.error && errorResponse.error.message ? errorResponse.error.message : request.responseText;
      } catch (e) {
        errorMessage = request.responseText || 'HTTP ' + request.status;
      }
      callback({ code: 'HTTP_ERROR', message: errorMessage, status: request.status }, null);
    }
  };
  
  request.ontimeout = function() {
    callback({ code: 'TIMEOUT', message: 'Timed out', status: 0 }, null);
  };
  
  request.onerror = function() {
    callback({ code: 'NETWORK_ERROR', message: 'Connection failed', status: 0 }, null);
  };
  
  request.open(method, url);
  
  for (var key in headers) {
    request.setRequestHeader(key, headers[key]);
  }
  
  request.send(body);
  return request;
};

module.exports = {
  request: function(options, callback) {
    var apiKey = options.apiKey;
    var model = options.model || 'openai/gpt-oss-20b';
    var messages = options.messages || [];
    var maxTokens = options.maxTokens || 300;
    var timeout = options.timeout || 12000;
    
    var url = 'https://openrouter.ai/api/v1/chat/completions';
    
    var headers = {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'Ask Pebbpe'
    };
    
    var payload = {
      model: model,
      messages: messages,
      max_tokens: maxTokens
    };

    if (model.indexOf('openai/gpt-5') === 0) {
      payload.reasoning = {
        effort: 'minimal',
        exclude: true
      };
      payload.reasoning_effort = 'minimal';
    }
    
    if (model === 'openai/gpt-oss-20b') {
      payload.provider = {
        only: ['groq'],
        allow_fallbacks: false
      };
    }
    
    var body = JSON.stringify(payload);
    
    return xhrRequest(url, 'POST', headers, body, timeout, callback);
  }
};
