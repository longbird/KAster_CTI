#!/usr/bin/env python3
"""
Download ChatGPT share pages and extract clean (role, text) transcripts.
Usage: python3 extract.py <share_id_1> <share_id_2> ...
Outputs: conversations.json (one object per share, with title and messages)
"""
import json, re, sys, subprocess, os

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def download(share_id, out_path):
    url = f"https://chatgpt.com/share/{share_id}"
    subprocess.run(["curl", "-sS", "-A", UA, url, "-o", out_path], check=True)

def deref_build(data):
    sys.setrecursionlimit(30000)
    def deref(v, depth=0, stack=None):
        if stack is None:
            stack = set()
        if depth > 150:
            return None
        if isinstance(v, dict):
            key = id(v)
            if key in stack:
                return None
            stack = stack | {key}
            out = {}
            for k, val in v.items():
                if isinstance(k, str) and k.startswith("_"):
                    try:
                        ki = int(k[1:])
                        actual = data[ki] if 0 <= ki < len(data) else k
                    except Exception:
                        actual = k
                else:
                    actual = k
                if isinstance(val, int):
                    if 0 <= val < len(data):
                        out[actual] = deref(data[val], depth + 1, stack)
                    else:
                        out[actual] = None
                else:
                    out[actual] = deref(val, depth + 1, stack)
            return out
        if isinstance(v, list):
            out = []
            for x in v:
                if isinstance(x, int) and 0 <= x < len(data):
                    out.append(deref(data[x], depth + 1, stack))
                else:
                    out.append(deref(x, depth + 1, stack))
            return out
        return v
    return deref

def extract_conversation(html_path):
    with open(html_path) as f:
        h = f.read()
    m = re.search(r'streamController\.enqueue\("(.*?)"\);', h, re.S)
    if not m:
        return None
    inner = json.loads('"' + m.group(1) + '"')
    data = json.loads(inner)
    deref = deref_build(data)

    # data[27] is the serverResponse.data per inspection, but it may shift
    # Safer: walk data[0].loaderData.routes/share....serverResponse.data
    root = deref(data[0])
    try:
        route = root["loaderData"]["routes/share.$shareId.($action)"]
        conv = route["serverResponse"]["data"]
    except Exception:
        # Fallback: scan for any dict that has linear_conversation + mapping
        conv = None
        for i, v in enumerate(data):
            if isinstance(v, dict):
                d = deref(v)
                if isinstance(d, dict) and "linear_conversation" in d and "mapping" in d:
                    conv = d
                    break
    if not conv:
        return None

    title = conv.get("title") or ""
    mapping = conv.get("mapping") or {}
    linear = conv.get("linear_conversation") or []

    messages = []
    for node in linear:
        node_id = node.get("id") if isinstance(node, dict) else None
        if not node_id:
            continue
        entry = mapping.get(node_id) if isinstance(mapping, dict) else None
        if not isinstance(entry, dict):
            continue
        msg = entry.get("message")
        if not isinstance(msg, dict):
            continue
        author = (msg.get("author") or {}).get("role")
        meta = msg.get("metadata") or {}
        if meta.get("is_visually_hidden_from_conversation"):
            continue
        content = msg.get("content") or {}
        parts = content.get("parts") or []
        text_parts = []
        for p in parts:
            if isinstance(p, str):
                text_parts.append(p)
            elif isinstance(p, dict):
                # asset_pointer (image) or similar
                text_parts.append(f"[{p.get('content_type','non-text')}]")
        text = "\n".join(t for t in text_parts if t)
        if not text:
            continue
        messages.append({"role": author, "text": text})

    return {"title": title, "messages": messages, "message_count": len(messages)}

def main():
    share_ids = sys.argv[1:]
    os.makedirs("html", exist_ok=True)
    results = {}
    for i, sid in enumerate(share_ids, 1):
        html_path = f"html/{sid}.html"
        if not os.path.exists(html_path):
            try:
                download(sid, html_path)
            except subprocess.CalledProcessError as e:
                print(f"[{i}/{len(share_ids)}] download failed {sid}: {e}", file=sys.stderr)
                continue
        try:
            conv = extract_conversation(html_path)
        except Exception as e:
            print(f"[{i}/{len(share_ids)}] extract failed {sid}: {e}", file=sys.stderr)
            continue
        if conv:
            results[sid] = conv
            print(f"[{i}/{len(share_ids)}] {sid}: {conv['title']} ({conv['message_count']} msgs)")
        else:
            print(f"[{i}/{len(share_ids)}] {sid}: EMPTY")

    with open("conversations.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nsaved conversations.json with {len(results)} entries")

if __name__ == "__main__":
    main()
