import os
import requests
import json
from flask import Flask, request, Response, stream_with_context, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

GROQ_KEY = os.getenv("GROQ_API_KEY", "").strip()

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not GROQ_KEY:
        def key_err(): yield f"data: {json.dumps({'error': 'GROQ_API_KEY missing'})}\n\n"
        return Response(stream_with_context(key_err()), mimetype='text/event-stream')

    try:
        data = request.get_json()
        sys_msg = data.get('systemPrompt', "You are a helpful assistant.")
        user_q = data.get('prompt', 'Hello')
        context = data.get('context', '')
        mode = data.get('mode', 'strict')

        def generate():
            # FIXED: Added missing comma in the payload and enabled stream: True
            payload = {
                "model": "deepseek-r1-distill-llama-70b", # Fixed comma here
                "messages": [
                    {
                        "role": "system", 
                        "content": f"{sys_msg} RULE: Answer strictly based on manuscript. Use <think> tags."
                    },
                    {
                        "role": "user", 
                        "content": f"MANUSCRIPT:\n{context[:5000]}\n\nQUESTION: {user_q}"
                    }
                ],
                "temperature": 0.6,
                "stream": True # CRITICAL for Vercel stability
            }

            response = requests.post(
                url="https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
                json=payload,
                stream=True,
                timeout=90 
            )

            for line in response.iter_lines():
                if line:
                    decoded = line.decode('utf-8').replace('data: ', '')
                    if decoded == '[DONE]': break
                    try:
                        chunk = json.loads(decoded)
                        token = chunk['choices'][0]['delta'].get('content', '')
                        if token:
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    except: continue

        return Response(stream_with_context(generate()), mimetype='text/event-stream')

    except Exception as e:
        return jsonify({"error": str(e)}), 500
