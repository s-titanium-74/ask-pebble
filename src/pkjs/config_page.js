module.exports = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'<title>Ask Pebble Settings</title>' +
'<style>' +
'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; background: #f5f5f5; max-width: 400px; margin: 0 auto; }' +
'h1 { font-size: 20px; margin-bottom: 16px; }' +
'.section { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; }' +
'label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 14px; }' +
'input, select, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; margin-bottom: 12px; font-size: 14px; }' +
'label input[type="checkbox"] { width: auto; margin-right: 8px; }' +
'.api-key-status { color: #2e7d32; font-size: 13px; margin-bottom: 8px; }' +
'.provider-info { background: #f0f0f0; padding: 8px; border-radius: 4px; font-size: 13px; margin-bottom: 12px; }' +
'.provider-info p { margin: 4px 0; }' +
'button { width: 100%; padding: 12px; border: none; border-radius: 4px; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 8px; }' +
'.save-btn { background: #1976d2; color: white; }' +
'.delete-btn { background: #d32f2f; color: white; }' +
'.reset-btn { background: #757575; color: white; }' +
'.link-btn { background: #f0f0f0; color: #333; }' +
'.advanced-toggle { color: #1976d2; text-decoration: underline; cursor: pointer; font-size: 14px; margin-bottom: 12px; display: inline-block; }' +
'.advanced { display: none; }' +
'.advanced.visible { display: block; }' +
'.note { font-size: 12px; color: #666; margin-top: 8px; }' +
'</style>' +
'</head>' +
'<body>' +
'<h1>Ask Pebble Settings</h1>' +
'<div class="section">' +
'<label for="apiKey">OpenRouter API key</label>' +
'<div id="apiKeyStatus" class="api-key-status" style="display:none;">OpenRouter API key saved</div>' +
'<input type="text" id="apiKey" placeholder="Enter your OpenRouter API key">' +
'<div class="provider-info">' +
'<p><strong>Provider:</strong> OpenRouter</p>' +
'<p><strong>Routing:</strong> Model-specific</p>' +
'<p><strong>Speed route:</strong> Groq only</p>' +
'</div>' +
'<label for="language">Response language</label>' +
'<select id="language">' +
'<option value="Auto" selected>Auto</option>' +
'<option value="Japanese">Japanese</option>' +
'<option value="English">English</option>' +
'<option value="Chinese (Simplified)">Chinese (Simplified)</option>' +
'<option value="Chinese (Traditional)">Chinese (Traditional)</option>' +
'<option value="Korean">Korean</option>' +
'<option value="Spanish">Spanish</option>' +
'<option value="French">French</option>' +
'<option value="German">German</option>' +
'<option value="Portuguese">Portuguese</option>' +
'<option value="Italian">Italian</option>' +
'<option value="Russian">Russian</option>' +
'<option value="Arabic">Arabic</option>' +
'<option value="Hindi">Hindi</option>' +
'</select>' +
'<p class="note">Controls AI answer language only. Dictation language follows your phone system language.</p>' +
'<label for="systemInstruction">System instruction</label>' +
'<textarea id="systemInstruction" rows="3" placeholder="Optional custom instruction"></textarea>' +
'<label><input type="checkbox" id="includeTimeContext">Include time context</label>' +
'<label><input type="checkbox" id="includeLocationContext">Include location context</label>' +
'<label><input type="checkbox" id="includeHealthContext">Include health context</label>' +
'<p class="note">Location and health are used only when the model asks for them.</p>' +
'<label for="model">Recommended model</label>' +
'<select id="model">' +
'<option value="openai/gpt-oss-20b" selected>Speed (Groq GPT-OSS 20B)</option>' +
'<option value="openai/gpt-5-mini">Balance (GPT-5 Mini)</option>' +
'<option value="anthropic/claude-haiku-4.5">Quality (Claude Haiku 4.5)</option>' +
'</select>' +
'<button class="link-btn" onclick="window.open(\'https://openrouter.ai/settings/keys\', \'_blank\')">Create OpenRouter API key</button>' +
'<button class="link-btn" onclick="window.open(\'https://openrouter.ai/settings/credits\', \'_blank\')">Check credits / usage</button>' +
'<button class="delete-btn" onclick="deleteApiKey()">Delete OpenRouter API key</button>' +
'<button class="reset-btn" onclick="resetMemory()">Reset conversation memory</button>' +
'</div>' +
'<div class="section">' +
'<span class="advanced-toggle" onclick="toggleAdvanced()">Advanced settings</span>' +
'<div class="advanced" id="advancedSection">' +
'<label for="customModelId">Custom model id</label>' +
'<input type="text" id="customModelId" placeholder="Optional: override dropdown model">' +
'<div id="customModelStatus" style="display:none; color:#1976d2; font-size:13px; margin-bottom:8px;">Using custom model</div>' +
'<label for="maxOutputTokens">Max output tokens</label>' +
'<select id="maxOutputTokens">' +
'<option value="128">128</option>' +
'<option value="300" selected>300</option>' +
'<option value="512">512</option>' +
'</select>' +
'<label for="memoryDepth">Memory depth</label>' +
'<select id="memoryDepth">' +
'<option value="0">0</option>' +
'<option value="1">1</option>' +
'<option value="2" selected>2</option>' +
'<option value="3">3</option>' +
'</select>' +
'<label for="timeoutSeconds">Timeout seconds</label>' +
'<input type="number" id="timeoutSeconds" min="8" max="20" value="12">' +
'</div>' +
'</div>' +
'<button class="save-btn" onclick="save()">Save</button>' +
'<script>' +
'var settings = {};' +
'try { var hash = window.location.hash.substring(1); if (hash) { settings = JSON.parse(decodeURIComponent(hash)); } } catch (e) {}' +
'if (settings.apiKey) { document.getElementById("apiKeyStatus").style.display = "block"; document.getElementById("apiKey").value = ""; }' +
'if (settings.language) document.getElementById("language").value = settings.language;' +
'if (settings.model) document.getElementById("model").value = settings.model;' +
'if (settings.customModelId) { document.getElementById("customModelId").value = settings.customModelId; document.getElementById("customModelStatus").style.display = "block"; }' +
'if (settings.systemInstruction) document.getElementById("systemInstruction").value = settings.systemInstruction;' +
'document.getElementById("includeTimeContext").checked = settings.includeTimeContext !== false;' +
'document.getElementById("includeLocationContext").checked = settings.includeLocationContext === true;' +
'document.getElementById("includeHealthContext").checked = settings.includeHealthContext === true;' +
'if (settings.maxOutputTokens) document.getElementById("maxOutputTokens").value = settings.maxOutputTokens;' +
'if (settings.memoryDepth) document.getElementById("memoryDepth").value = settings.memoryDepth;' +
'if (settings.timeoutSeconds) document.getElementById("timeoutSeconds").value = settings.timeoutSeconds;' +
'function toggleAdvanced() { document.getElementById("advancedSection").classList.toggle("visible"); }' +
'var apiKeyDeletedFlag = false;' +
'function deleteApiKey() { if (confirm("Delete your OpenRouter API key and conversation memory?")) { apiKeyDeletedFlag = true; memoryResetFlag = true; document.getElementById("apiKey").value = ""; document.getElementById("apiKeyStatus").style.display = "none"; } }' +
'var memoryResetFlag = false; function resetMemory() { memoryResetFlag = true; alert("Memory reset"); }' +
'function save() { var resetFlag = memoryResetFlag; memoryResetFlag = false; var apiKeyValue = document.getElementById("apiKey").value.trim(); var deleteFlag = apiKeyDeletedFlag && !apiKeyValue; apiKeyDeletedFlag = false; var newSettings = { apiKey: apiKeyValue, apiKeyDeleted: deleteFlag, language: document.getElementById("language").value, model: document.getElementById("model").value, customModelId: document.getElementById("customModelId").value.trim(), systemInstruction: document.getElementById("systemInstruction").value.trim(), includeTimeContext: document.getElementById("includeTimeContext").checked, includeLocationContext: document.getElementById("includeLocationContext").checked, includeHealthContext: document.getElementById("includeHealthContext").checked, maxOutputTokens: document.getElementById("maxOutputTokens").value, memoryDepth: document.getElementById("memoryDepth").value, timeoutSeconds: document.getElementById("timeoutSeconds").value, memoryReset: resetFlag }; window.location.href = "pebblejs://close#" + encodeURIComponent(JSON.stringify(newSettings)); }' +
'<\/script>' +
'</body>' +
'</html>';
