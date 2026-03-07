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
        def key_err(): 
            yield f"data: {json.dumps({'error': 'GROQ_API_KEY missing in Vercel settings'})}\n\n"
        return Response(stream_with_context(key_err()), mimetype='text/event-stream')

    try:
        data = request.get_json()
        user_q = data.get('prompt', '')
        raw_context = data.get('context', '')
        mode = data.get('mode', 'strict')

        def generate():
            # Instructions to force the model to think and stay grounded
            if mode == 'strict':
                sys_msg = "STRICT MODE: Use ONLY the manuscript. Think in <think> tags. If missing, say you don't know."
            else:
                sys_msg = "GLOBAL MODE: Use text + your brain. Think in <think> tags."

            payload = {
                "model": "deepseek-r1-distill-llama-70b",
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": f"MANUSCRIPT:\n{raw_context[:6000]}\n\nQUESTION: {user_q}"}
                ],
                "temperature": 0.6,
                "stream": True 
            }

            response = requests.post(
                url="https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
                json=payload,
                stream=True,
                timeout=90 
            )

            # STREAMING ENGINE
            for line in response.iter_lines():
                if line:
                    decoded = line.decode('utf-8').replace('data: ', '')
                    if decoded == '[DONE]': break
                    try:
                        chunk = json.loads(decoded)
                        token = chunk['choices'][0]['delta'].get('content', '')
                        if token:
                            # Flush data to the browser
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    except: continue

        return Response(stream_with_context(generate()), mimetype='text/event-stream')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=5000)
