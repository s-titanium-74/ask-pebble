#!/usr/bin/env python3
"""
PebbleKit JS 単体テスト (MVP 実装前検証 #2)

確認項目:
1. PebbleKit JS の OpenRouter API 呼び出しロジックが正しく動作するか
2. localStorage 設定の読み書きが正しく行われるか
3. 会話メモリ（直近2往復）が正しく管理されるか
4. システムインストラクションが正しく構築されるか
5. 回答が 240文字/768 bytes に正しく短縮されるか
6. エラーハンドリングが正しく行われるか

使い方:
  OPENROUTER_API_KEY=sk-xxx python3 verify_pebblekit_js.py
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

# ============================================
# PebbleKit JS ロジックの Python 模倣
# ============================================

class MockLocalStorage:
    """localStorage の代わり"""
    def __init__(self):
        self._data = {}
    
    def getItem(self, key):
        return self._data.get(key, None)
    
    def setItem(self, key, value):
        self._data[key] = value
    
    def removeItem(self, key):
        self._data.pop(key, None)

class MockPebbleKitJS:
    """PebbleKit JS のロジックを模倣"""
    
    def __init__(self, api_key):
        self.localStorage = MockLocalStorage()
        self.conversationMemory = []
        self.currentRequestId = None
        self.canceledRequestIds = {}
        
        # デフォルト設定
        self.defaultSettings = {
            'apiKey': api_key,
            'language': 'Auto',
            'model': 'openai/gpt-oss-20b',
            'customModelId': '',
            'systemInstruction': '',
            'maxOutputTokens': '300',
            'memoryDepth': '2',
            'timeoutSeconds': '12',
            'includeTimeContext': True,
            'includeLocationContext': False,
            'includeHealthContext': False
        }
        
        # 設定保存
        self.localStorage.setItem('ask_pebble_settings', json.dumps(self.defaultSettings))
    
    def getSettings(self):
        """config.js の getSettings() 相当"""
        try:
            stored = self.localStorage.getItem('ask_pebble_settings')
            if stored:
                parsed = json.loads(stored)
                settings = {}
                for key in self.defaultSettings:
                    settings[key] = parsed.get(key, self.defaultSettings[key])
                return settings
        except Exception as e:
            print(f"[WARN] Error parsing settings: {e}")
        return self.defaultSettings
    
    def hasApiKey(self):
        """config.js の hasApiKey() 相当"""
        settings = self.getSettings()
        return bool(settings.get('apiKey'))
    
    def getModel(self):
        """config.js の getModel() 相当"""
        settings = self.getSettings()
        if settings.get('customModelId'):
            return settings['customModelId']
        return settings.get('model', self.defaultSettings['model'])
    
    def buildSystemInstruction(self, settings, include_tool_instructions=False):
        """index.js の buildSystemInstruction() 相当"""
        parts = [
            'Answer for a small smartwatch screen. Keep it under 240 characters. Be direct, practical, and easy to scan. The user message is speech-to-text dictation, so infer the intended meaning despite recognition errors, missing punctuation, or unstable wording. If asked your name, answer Pebble. Skip greetings, filler, and markdown unless the user asks for formatting. If uncertain, say so briefly.'
        ]
        
        language = settings.get('language', 'Auto')
        language_instructions = {
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
        }
        if language == 'Auto':
            parts.append('Detect the user\'s language from the message and answer in the same language.')
        elif language in language_instructions:
            parts.append(language_instructions[language])
        
        if settings.get('systemInstruction'):
            parts.append(settings['systemInstruction'])

        if include_tool_instructions:
            tools = self.getAvailableTools(settings)
            if tools:
                parts.append('If answering requires unavailable device context, respond only with JSON in this exact shape: {"tools":["location","health"],"reason":"brief"}. Use only these tools if needed: ' + ', '.join(tools) + '. You may request multiple tools. If no tool is needed, answer normally without JSON.')
        
        return '\n'.join(parts)
    
    def buildMessages(self, utterance, settings, context_text=None, include_tool_instructions=False):
        """index.js の buildMessages() 相当"""
        messages = []
        
        # System instruction
        system_instruction = self.buildSystemInstruction(settings, include_tool_instructions)
        messages.append({'role': 'system', 'content': system_instruction})
        
        # Conversation memory
        memory_depth = int(settings.get('memoryDepth', 2))
        max_messages = memory_depth * 2
        recent_messages = self.conversationMemory[-max_messages:] if max_messages > 0 else []
        messages.extend(recent_messages)

        context_parts = []
        if settings.get('includeTimeContext') is not False:
            context_parts.append('Time: 2026-06-06 14:35, America/Chicago')
        if context_text:
            context_parts.append(context_text)
        if context_parts:
            messages.append({'role': 'user', 'content': 'Device context:\n' + '\n'.join(context_parts)})
        
        # User message
        messages.append({'role': 'user', 'content': utterance})
        
        return messages

    def getAvailableTools(self, settings):
        tools = []
        if settings.get('includeTimeContext') is not False:
            tools.append('time')
        if settings.get('includeLocationContext') is True:
            tools.append('location')
        if settings.get('includeHealthContext') is True:
            tools.append('health')
        return tools

    def parseToolRequest(self, answer, available_tools):
        json_text = self.extractJsonText(answer or '')
        if not json_text:
            return {'hasJson': False, 'request': None}
        try:
            parsed = json.loads(json_text)
        except Exception:
            return {'hasJson': True, 'request': None}
        tools = parsed.get('tools') if isinstance(parsed, dict) else None
        if not isinstance(tools, list):
            return {'hasJson': True, 'request': None}
        allowed = set(available_tools)
        deduped = []
        for tool in tools:
            if not isinstance(tool, str) or tool not in allowed:
                return {'hasJson': True, 'request': None}
            if tool not in deduped:
                deduped.append(tool)
        if not deduped:
            return {'hasJson': True, 'request': None}
        return {'hasJson': True, 'request': {'tools': deduped, 'reason': parsed.get('reason', '')}}

    def extractJsonText(self, text):
        start = -1
        for index, char in enumerate(text):
            if char in '{[':
                start = index
                break
        if start == -1:
            return ''
        open_char = text[start]
        close_char = '}' if open_char == '{' else ']'
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == '"':
                    in_string = False
            elif char == '"':
                in_string = True
            elif char == open_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    return text[start:index + 1]
        return text[start:]
    
    def truncateAnswer(self, answer, max_chars=240, max_bytes=768):
        """index.js の truncateAnswer() 相当"""
        if not answer:
            return ''
        
        # Truncate by character count
        truncated = answer
        if len(truncated) > max_chars:
            truncated = truncated[:max_chars - 3] + '...'
        
        # Check byte size
        while len(truncated.encode('utf-8')) > max_bytes and len(truncated) > 3:
            truncated = truncated[:-4] + '...'
        
        return truncated
    
    def addToMemory(self, utterance, answer):
        """index.js の addToMemory() 相当"""
        settings = self.getSettings()
        memory_depth = int(settings.get('memoryDepth', 2))
        max_messages = memory_depth * 2

        if max_messages == 0:
            self.conversationMemory = []
            return
        
        self.conversationMemory.append({'role': 'user', 'content': utterance})
        self.conversationMemory.append({'role': 'assistant', 'content': answer})
        
        # Trim to max
        if len(self.conversationMemory) > max_messages:
            self.conversationMemory = self.conversationMemory[-max_messages:]
    
    def mapOpenRouterError(self, status, error_message):
        """index.js の mapOpenRouterError() 相当"""
        if status == 401 or status == 403:
            return 'auth_failed'
        if status == 429:
            return 'rate_limited'
        if status == 402:
            return 'rate_limited'
        if status == 400:
            if 'model' in error_message.lower():
                return 'model_failed'
            return 'provider_failed'
        if status in [502, 503, 504]:
            return 'provider_failed'
        if status == 0:
            return 'network_failed'
        return 'provider_failed'
    
    def callOpenRouter(self, messages):
        """openrouter.js の request() 相当"""
        settings = self.getSettings()
        api_key = settings['apiKey']
        model = self.getModel()
        max_tokens = int(settings.get('maxOutputTokens', 300))
        timeout = int(settings.get('timeoutSeconds', 12))
        
        payload = {
            'model': model,
            'messages': messages,
            'max_tokens': max_tokens
        }
        
        if model == 'openai/gpt-oss-20b':
            payload['provider'] = {
                'only': ['groq'],
                'allow_fallbacks': False
            }
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'X-OpenRouter-Title': 'Ask Pebble'
        }
        
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            'https://openrouter.ai/api/v1/chat/completions',
            data=data,
            headers=headers,
            method='POST'
        )
        
        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                elapsed = time.time() - start_time
                body = response.read().decode('utf-8')
                result = json.loads(body)
                return {
                    'success': True,
                    'elapsed': elapsed,
                    'status': response.status,
                    'answer': result['choices'][0]['message']['content'] if result.get('choices') else None,
                    'model': result.get('model'),
                    'provider': result.get('provider')
                }
        except urllib.error.HTTPError as e:
            elapsed = time.time() - start_time
            body = e.read().decode('utf-8')
            try:
                error_data = json.loads(body)
                error_message = error_data.get('error', {}).get('message', body)
            except:
                error_message = body
            return {
                'success': False,
                'elapsed': elapsed,
                'status': e.code,
                'error': error_message
            }
        except Exception as e:
            elapsed = time.time() - start_time
            return {
                'success': False,
                'elapsed': elapsed,
                'status': 0,
                'error': str(e)
            }
    
    def handleAsk(self, request_id, utterance):
        """index.js の handleAsk() 相当"""
        self.currentRequestId = request_id
        
        if not self.hasApiKey():
            return {'type': 'error', 'requestId': request_id, 'errorCode': 'missing_api_key', 'message': 'Set API key'}
        
        settings = self.getSettings()
        messages = self.buildMessages(utterance, settings)
        
        result = self.callOpenRouter(messages)
        
        if not result['success']:
            error_code = self.mapOpenRouterError(result['status'], result['error'])
            return {'type': 'error', 'requestId': request_id, 'errorCode': error_code, 'message': result['error'][:100]}
        
        answer = result['answer'] or ''
        shortened_answer = self.truncateAnswer(answer)
        
        # Add to memory
        self.addToMemory(utterance, shortened_answer)
        
        return {'type': 'answer', 'requestId': request_id, 'answer': shortened_answer}


# ============================================
# テスト実行
# ============================================

def test_settings_management():
    """設定管理のテスト"""
    print("\n--- Test: Settings Management ---")
    
    pkjs = MockPebbleKitJS('test-api-key')
    
    # デフォルト設定の確認
    settings = pkjs.getSettings()
    assert settings['language'] == 'Auto', "Default language should be Auto"
    assert settings['model'] == 'openai/gpt-oss-20b', "Default model should be speed"
    assert pkjs.hasApiKey() == True, "Should have API key"
    
    # カスタムモデルの確認
    settings['customModelId'] = 'custom-model-123'
    pkjs.localStorage.setItem('ask_pebble_settings', json.dumps(settings))
    assert pkjs.getModel() == 'custom-model-123', "Custom model should take priority"
    
    print("  [PASS] Settings management works correctly")


def test_system_instruction():
    """システムインストラクション構築のテスト"""
    print("\n--- Test: System Instruction ---")
    
    pkjs = MockPebbleKitJS('test-key')
    
    # Default: Auto
    settings = pkjs.getSettings()
    instruction = pkjs.buildSystemInstruction(settings)
    assert '240 characters' in instruction, "Should mention 240 chars"
    assert 'speech-to-text dictation' in instruction, "Should mention dictation input"
    assert 'recognition errors' in instruction, "Should mention recognition errors"
    assert 'answer Pebble' in instruction, "Should answer name as Pebble"
    assert 'Detect' in instruction, "Should mention detect language"
    
    # 日本語
    settings['language'] = 'Japanese'
    instruction = pkjs.buildSystemInstruction(settings)
    assert 'Japanese' in instruction, "Should mention Japanese"
    
    # 英語
    settings['language'] = 'English'
    instruction = pkjs.buildSystemInstruction(settings)
    assert 'English' in instruction, "Should mention English"

    # Major language options
    expected_languages = {
        'Chinese (Simplified)': 'Simplified Chinese',
        'Chinese (Traditional)': 'Traditional Chinese',
        'Korean': 'Korean',
        'Spanish': 'Spanish',
        'French': 'French',
        'German': 'German',
        'Portuguese': 'Portuguese',
        'Italian': 'Italian',
        'Russian': 'Russian',
        'Arabic': 'Arabic',
        'Hindi': 'Hindi'
    }
    for language, expected in expected_languages.items():
        settings['language'] = language
        instruction = pkjs.buildSystemInstruction(settings)
        assert expected in instruction, f"Should mention {expected}"
    
    # Auto
    settings['language'] = 'Auto'
    instruction = pkjs.buildSystemInstruction(settings)
    assert 'Detect' in instruction, "Should mention detect language"
    
    # カスタムインストラクション
    settings['systemInstruction'] = 'Be extra friendly.'
    instruction = pkjs.buildSystemInstruction(settings)
    assert 'Be extra friendly.' in instruction, "Should include custom instruction"

    # Tool instruction only on first call
    settings['includeLocationContext'] = True
    settings['includeHealthContext'] = True
    instruction = pkjs.buildSystemInstruction(settings, include_tool_instructions=True)
    assert '"tools"' in instruction, "Should include pseudo tool schema on first call"
    assert 'location' in instruction and 'health' in instruction, "Should list enabled tools"
    instruction = pkjs.buildSystemInstruction(settings, include_tool_instructions=False)
    assert '"tools"' not in instruction, "Should omit pseudo tool schema on second call"
    
    print("  [PASS] System instruction built correctly")


def test_tool_request_parsing():
    """擬似 tool request parsing のテスト"""
    print("\n--- Test: Tool Request Parsing ---")

    pkjs = MockPebbleKitJS('test-key')
    settings = pkjs.getSettings()
    settings['includeLocationContext'] = True
    settings['includeHealthContext'] = True
    available_tools = pkjs.getAvailableTools(settings)

    parsed = pkjs.parseToolRequest('{"tools":["location","health"],"reason":"weather"}', available_tools)
    assert parsed['hasJson'] is True, "Should detect JSON"
    assert parsed['request']['tools'] == ['location', 'health'], "Should parse multiple tools"

    parsed = pkjs.parseToolRequest('Need context: {"tools":["health"],"reason":"steps"}', available_tools)
    assert parsed['request']['tools'] == ['health'], "Should parse embedded JSON"

    parsed = pkjs.parseToolRequest('普通の回答です', available_tools)
    assert parsed['hasJson'] is False, "Should not treat normal text as tool request"

    parsed = pkjs.parseToolRequest('{"tools":["calendar"],"reason":"schedule"}', available_tools)
    assert parsed['hasJson'] is True and parsed['request'] is None, "Unknown tool should fail closed"

    parsed = pkjs.parseToolRequest('{"tool":"location"}', available_tools)
    assert parsed['hasJson'] is True and parsed['request'] is None, "Invalid schema should fail closed"

    print("  [PASS] Tool request parsing works correctly")


def test_conversation_memory():
    """会話メモリのテスト"""
    print("\n--- Test: Conversation Memory ---")
    
    pkjs = MockPebbleKitJS('test-key')
    
    # テスト用のリクエストをシミュレート
    pkjs.conversationMemory = []
    
    # 1往復追加
    pkjs.addToMemory('Hello', 'Hi there!')
    assert len(pkjs.conversationMemory) == 2, "Should have 2 messages"
    
    # 2往復追加
    pkjs.addToMemory('How are you?', 'I am good!')
    assert len(pkjs.conversationMemory) == 4, "Should have 4 messages"
    
    # 3往復追加（memoryDepth=2 なので古いのが消える）
    pkjs.addToMemory('What is AI?', 'Artificial Intelligence.')
    assert len(pkjs.conversationMemory) == 4, "Should still have 4 messages (trimmed)"
    assert pkjs.conversationMemory[0]['content'] == 'How are you?', "Old message should be dropped"
    
    print("  [PASS] Conversation memory managed correctly")


def test_conversation_memory_disabled():
    """会話メモリ無効化のテスト"""
    print("\n--- Test: Conversation Memory Disabled ---")

    pkjs = MockPebbleKitJS('test-key')
    settings = pkjs.getSettings()
    settings['memoryDepth'] = '0'
    settings['includeTimeContext'] = False
    pkjs.localStorage.setItem('ask_pebble_settings', json.dumps(settings))

    pkjs.conversationMemory = [
        {'role': 'user', 'content': 'Old question'},
        {'role': 'assistant', 'content': 'Old answer'}
    ]
    messages = pkjs.buildMessages('New question', pkjs.getSettings())
    assert len(messages) == 2, "Should include only system and current user message"
    assert messages[1]['content'] == 'New question', "Should not include previous memory"

    pkjs.addToMemory('New question', 'New answer')
    assert len(pkjs.conversationMemory) == 0, "Should not store memory when depth is 0"

    print("  [PASS] Conversation memory can be disabled")


def test_truncate_answer():
    """回答短縮のテスト"""
    print("\n--- Test: Answer Truncation ---")
    
    pkjs = MockPebbleKitJS('test-key')
    
    # 短い回答（短縮不要）
    short = "Hello!"
    assert pkjs.truncateAnswer(short) == "Hello!", "Short answer should not be truncated"
    
    # 240文字を超える回答
    long_text = "A" * 300
    truncated = pkjs.truncateAnswer(long_text)
    assert len(truncated) <= 240, f"Should be <= 240 chars, got {len(truncated)}"
    assert truncated.endswith('...'), "Should end with ..."
    
    # UTF-8 bytes テスト（日本語）
    japanese = "あ" * 300  # 300文字 = 900 bytes
    truncated_jp = pkjs.truncateAnswer(japanese)
    assert len(truncated_jp.encode('utf-8')) <= 768, f"Should be <= 768 bytes, got {len(truncated_jp.encode('utf-8'))}"
    
    print("  [PASS] Answer truncation works correctly")


def test_e2e_ask(api_key):
    """E2E テスト: ask リクエスト"""
    print("\n--- Test: E2E Ask Request ---")
    
    pkjs = MockPebbleKitJS(api_key)
    
    # テスト1: 通常の質問
    result = pkjs.handleAsk(1, "今日の天気は？")
    
    if result['type'] == 'error':
        print(f"  [ERROR] Request failed: {result['errorCode']} - {result['message']}")
        return False
    
    assert result['type'] == 'answer', "Should return answer type"
    assert result['requestId'] == 1, "Should preserve requestId"
    assert 'answer' in result, "Should have answer field"
    assert len(result['answer']) <= 240, f"Answer should be <= 240 chars"
    assert len(result['answer'].encode('utf-8')) <= 768, f"Answer should be <= 768 bytes"
    
    print(f"  [PASS] E2E ask works. Answer: {result['answer'][:50]}...")
    
    # テスト2: メモリを使った連続会話
    result2 = pkjs.handleAsk(2, "明日は？")
    
    if result2['type'] == 'error':
        print(f"  [WARN] Second request failed: {result2['errorCode']}")
        return False
    
    assert len(pkjs.conversationMemory) == 4, "Should have 2 exchanges in memory"
    
    print(f"  [PASS] Conversation memory preserved. Answer: {result2['answer'][:50]}...")
    
    return True


def test_error_handling(api_key):
    """エラーハンドリングのテスト"""
    print("\n--- Test: Error Handling ---")
    
    # 無効な API key
    pkjs = MockPebbleKitJS('invalid-key')
    result = pkjs.handleAsk(1, "Test")
    
    assert result['type'] == 'error', "Should return error for invalid key"
    assert result['errorCode'] == 'auth_failed', f"Should be auth_failed, got {result['errorCode']}"
    
    print("  [PASS] Error handling works correctly")


def main():
    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        print("[ERROR] OPENROUTER_API_KEY が設定されていません")
        sys.exit(1)
    
    print("=" * 60)
    print("PebbleKit JS 単体テスト (実装前検証 #2)")
    print("=" * 60)
    
    # ロジックテスト（API 不要）
    test_settings_management()
    test_system_instruction()
    test_tool_request_parsing()
    test_conversation_memory()
    test_conversation_memory_disabled()
    test_truncate_answer()
    
    # エラーハンドリングテスト
    test_error_handling(api_key)
    
    # E2E テスト（API 必要）
    success = test_e2e_ask(api_key)
    
    # サマリー
    print("\n" + "=" * 60)
    print("検証結果サマリー")
    print("=" * 60)
    
    if success:
        print("[PASS] PebbleKit JS ロジックが正しく動作しています")
        print("→ MVP 実装を進行できます")
    else:
        print("[WARN] 一部のテストが失敗しました")
        print("→ コードレビューが必要です")
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
