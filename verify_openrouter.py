#!/usr/bin/env python3
"""
OpenRouter API 検証スクリプト (MVP 実装前ゲート)

確認項目:
1. OpenRouter API key で認証できるか
2. provider routing {only: ["groq"], allow_fallbacks: false} が機能するか
3. モデルが Groq-only で実際に推論できるか
4. レスポンス形式が想定通りか
5. レイテンシ（P50 目標: 10秒以内）

使い方:
  OPENROUTER_API_KEY=sk-xxx python3 verify_openrouter.py
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

# テスト対象モデル (MVP dropdown 候補)
MODELS = [
    "meta-llama/llama-3.1-8b-instruct",
    "meta-llama/llama-3.3-70b-instruct",
    "openai/gpt-oss-20b"
]

# テスト質問
TEST_MESSAGES = [
    {"role": "system", "content": "Answer for a small smartwatch screen. Be concise, practical, and keep it under 240 characters.\nAnswer in Japanese."},
    {"role": "user", "content": "今日の天気が気になります。短く教えて。"}
]

API_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_SECONDS = 15


def call_openrouter(api_key, model, messages):
    """OpenRouter API を呼び出して結果を返す"""
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": 300,
        "provider": {
            "only": ["groq"],
            "allow_fallbacks": False
        }
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Ask Pebbpe"
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data, headers=headers, method="POST")
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            elapsed = time.time() - start_time
            body = response.read().decode("utf-8")
            result = json.loads(body)
            return {
                "success": True,
                "elapsed": elapsed,
                "status": response.status,
                "model_used": result.get("model", "unknown"),
                "provider": result.get("provider", "unknown"),
                "answer": result["choices"][0]["message"]["content"] if result.get("choices") else None,
                "raw": result
            }
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        body = e.read().decode("utf-8")
        try:
            error_data = json.loads(body)
            error_message = error_data.get("error", {}).get("message", body)
        except:
            error_message = body
        return {
            "success": False,
            "elapsed": elapsed,
            "status": e.code,
            "error": error_message,
            "raw": body
        }
    except Exception as e:
        elapsed = time.time() - start_time
        return {
            "success": False,
            "elapsed": elapsed,
            "status": 0,
            "error": str(e)
        }


def main():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[ERROR] 環境変数 OPENROUTER_API_KEY が設定されていません。")
        print("  取得方法: https://openrouter.ai/settings/keys")
        sys.exit(1)
    
    print("=" * 60)
    print("OpenRouter API 実装前検証 #1")
    print("=" * 60)
    print(f"API endpoint: {API_URL}")
    print(f"Provider route: Groq only / fallback off")
    print(f"Test message: {TEST_MESSAGES[1]['content']}")
    print()
    
    results = []
    
    for model in MODELS:
        print(f"\n--- Testing: {model} ---")
        result = call_openrouter(api_key, model, TEST_MESSAGES)
        results.append({"model": model, **result})
        
        if result["success"]:
            print(f"  Status: OK ({result['status']})")
            print(f"  Elapsed: {result['elapsed']:.2f}s")
            print(f"  Model used: {result['model_used']}")
            print(f"  Provider: {result['provider']}")
            print(f"  Answer: {result['answer'][:80]}...")
            
            # 文字数チェック
            if result["answer"]:
                char_count = len(result["answer"])
                byte_count = len(result["answer"].encode("utf-8"))
                print(f"  Answer length: {char_count} chars, {byte_count} bytes")
                if char_count > 240:
                    print(f"  [WARN] 240文字を超えています")
                if byte_count > 768:
                    print(f"  [WARN] 768 bytes を超えています")
        else:
            print(f"  Status: FAILED")
            print(f"  Elapsed: {result['elapsed']:.2f}s")
            print(f"  HTTP Status: {result['status']}")
            print(f"  Error: {result['error'][:200]}")
    
    # サマリー
    print("\n" + "=" * 60)
    print("検証結果サマリー")
    print("=" * 60)
    
    passed = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    
    print(f"成功: {len(passed)}/{len(MODELS)}")
    print(f"失敗: {len(failed)}/{len(MODELS)}")
    
    if passed:
        latencies = [r["elapsed"] for r in passed]
        latencies.sort()
        p50 = latencies[len(latencies)//2]
        print(f"レイテンシ P50: {p50:.2f}s (目標: <= 10s)")
    
    if failed:
        print("\n[FAIL] 以下のモデルが Groq-only で動作しませんでした:")
        for r in failed:
            print(f"  - {r['model']}: HTTP {r['status']} - {r['error'][:100]}")
        print("\n→ MVP の dropdown から除外する必要があります")
        print("→ または provider routing のフィールド名が変更されている可能性があります")
        sys.exit(1)
    else:
        print("\n[PASS] すべてのモデルが Groq-only で動作しました")
        print("→ MVP 実装を進行できます")


if __name__ == "__main__":
    main()
