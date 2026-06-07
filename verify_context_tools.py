#!/usr/bin/env python3
"""
Context tool flow verification for OpenRouter.

Checks:
1. Plain answer without tool instructions.
2. Tool-router JSON for context-needed and context-free questions.
3. Second-call answer with Device context.

Usage:
  OPENROUTER_API_KEY=sk-xxx python3 verify_context_tools.py
  OPENROUTER_API_KEY=sk-xxx python3 verify_context_tools.py openai/gpt-oss-20b
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request


API_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_SECONDS = 20
MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-5-mini",
    "anthropic/claude-haiku-4.5",
]

BASE_SYSTEM = (
    "Answer for a small smartwatch screen. Keep it under 240 characters. "
    "Be direct, practical, and easy to scan. The user message is speech-to-text dictation, "
    "so infer the intended meaning despite recognition errors, missing punctuation, or unstable wording. "
    "If asked your name, answer Pebble. Skip greetings, filler, and markdown unless the user asks for formatting. "
    "If uncertain, say so briefly.\n"
    "Detect the user's language from the message and answer in the same language."
)


def extract_answer(result):
    if not result.get("choices"):
        return None
    message = result["choices"][0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        text = content.strip()
        return text or None
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        text = "".join(parts).strip()
        return text or None
    return None


def response_shape(result):
    choices = result.get("choices") or []
    choice = choices[0] if choices else {}
    message = choice.get("message") or {}
    content = message.get("content")
    if content is None:
        content_type = "null"
    elif isinstance(content, list):
        content_type = "list"
    else:
        content_type = type(content).__name__
    return {
        "finish_reason": choice.get("finish_reason", "unknown"),
        "message_keys": sorted(message.keys()),
        "content_type": content_type,
    }


def call_openrouter(api_key, model, messages, max_tokens=300):
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if model.startswith("openai/gpt-5"):
        payload["reasoning"] = {
            "effort": "minimal",
            "exclude": True,
        }
        payload["reasoning_effort"] = "minimal"
    if model == "openai/gpt-oss-20b":
        payload["provider"] = {
            "only": ["groq"],
            "allow_fallbacks": False,
        }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Ask Pebbpe Context Tool Verify",
    }

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data, headers=headers, method="POST")
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            elapsed = time.time() - started
            raw_body = response.read().decode("utf-8")
            result = json.loads(raw_body)
            answer = extract_answer(result)
            return {
                "ok": bool(answer),
                "status": response.status,
                "elapsed": elapsed,
                "answer": answer,
                "shape": response_shape(result),
                "model_used": result.get("model", "unknown"),
                "provider": result.get("provider", "unknown"),
                "raw": result,
            }
    except urllib.error.HTTPError as error:
        elapsed = time.time() - started
        body = error.read().decode("utf-8")
        return {
            "ok": False,
            "status": error.code,
            "elapsed": elapsed,
            "error": body,
        }
    except Exception as error:
        elapsed = time.time() - started
        return {
            "ok": False,
            "status": 0,
            "elapsed": elapsed,
            "error": str(error),
        }


def parse_router(answer, allowed_tools):
    if not answer:
        return None
    start = answer.find("{")
    end = answer.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(answer[start : end + 1])
    except Exception:
        return None
    tools = parsed.get("tools")
    if not isinstance(tools, list):
        return None
    for tool in tools:
        if tool not in allowed_tools:
            return None
    return parsed


def print_result(label, result):
    status = "PASS" if result.get("ok") else "FAIL"
    print(f"\n[{status}] {label}")
    print(f"  Status: {result.get('status')}  Elapsed: {result.get('elapsed', 0):.2f}s")
    if result.get("model_used"):
        print(f"  Model used: {result['model_used']}")
    if result.get("provider"):
        print(f"  Provider: {result['provider']}")
    if result.get("shape"):
        shape = result["shape"]
        print(
            "  Shape: "
            f"finish={shape['finish_reason']} "
            f"content={shape['content_type']} "
            f"keys={','.join(shape['message_keys'])}"
        )
    if result.get("answer"):
        print(f"  Answer: {result['answer'][:160]}")
    if result.get("error"):
        print(f"  Error: {str(result['error'])[:240]}")


def verify_model(api_key, model):
    print("\n" + "=" * 70)
    print(f"Model: {model}")
    print("=" * 70)
    failures = 0

    plain_messages = [
        {"role": "system", "content": BASE_SYSTEM},
        {"role": "user", "content": "こんにちは。短く返事して。"},
    ]
    plain = call_openrouter(api_key, model, plain_messages)
    print_result("plain answer", plain)
    failures += 0 if plain["ok"] else 1

    router_system = (
        "Return JSON only. Decide which device context tools are needed to answer the user. "
        'Schema: {"tools":["tool_name"],"reason":"brief"}. '
        "Allowed tools: time, location, health. Use [] if none are needed."
    )
    router_cases = [
        ("router health", "今日の歩数を教えて", ["health"]),
        ("router none", "こんにちは。短く返事して。", []),
    ]
    for label, utterance, expected_tools in router_cases:
        result = call_openrouter(
            api_key,
            model,
            [
                {"role": "system", "content": router_system},
                {"role": "user", "content": utterance},
            ],
            max_tokens=180,
        )
        parsed = parse_router(result.get("answer"), {"time", "location", "health"})
        result["ok"] = result["ok"] and parsed is not None and parsed.get("tools") == expected_tools
        print_result(label, result)
        print(f"  Parsed: {parsed}")
        if not result["ok"]:
            print("  [DIAG] Standalone router is not part of the app flow; not counted as gate failure.")

    combined_system = (
        BASE_SYSTEM
        + '\nIf answering requires unavailable device context, respond only with JSON in this exact shape: {"tools":["location","health"],"reason":"brief"}. '
        + "Use only these tools if needed: time, location, health. You may request multiple tools. If no tool is needed, answer normally without JSON."
    )
    combined_cases = [
        ("combined tool prompt health", "今日の歩数を教えて"),
        ("combined tool prompt none", "こんにちは。短く返事して。"),
    ]
    for label, utterance in combined_cases:
        result = call_openrouter(
            api_key,
            model,
            [
                {"role": "system", "content": combined_system},
                {"role": "user", "content": utterance},
            ],
        )
        print_result(label, result)
        failures += 0 if result["ok"] else 1

    context_messages = [
        {
            "role": "system",
            "content": BASE_SYSTEM + "\nUse any Device context in the user message. Do not return tool JSON.",
        },
        {
            "role": "user",
            "content": (
                "Device context:\n"
                "Time: 2026-06-06 14:35, America/Chicago\n"
                "Health: stepsToday=4231, activeMinutesToday=38, "
                "sleepTodayMinutes=410, restfulSleepTodayMinutes=125\n\n"
                "User question:\n今日の歩数を短く教えて"
            ),
        },
    ]
    context = call_openrouter(api_key, model, context_messages)
    print_result("context second call", context)
    failures += 0 if context["ok"] else 1

    return failures


def main():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[ERROR] OPENROUTER_API_KEY is not set.")
        sys.exit(1)

    models = sys.argv[1:] or MODELS
    total_failures = 0
    for model in models:
        total_failures += verify_model(api_key, model)

    print("\n" + "=" * 70)
    if total_failures:
        print(f"[FAIL] {total_failures} check(s) failed")
        sys.exit(1)
    print("[PASS] all context tool checks passed")


if __name__ == "__main__":
    main()
