import os
import requests
import json
from flask import Flask, request, Response, stream_with_context, jsonify
from flask_cors import CORS

app = Flask(__name__)
# CORS is set to allow all origins for production stability
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

        # DeepSeek-R1 provides the 'Thinking' process you requested
        MODEL_ID = "deepseek-r1-distill-llama-70b"

        def generate():
            # NECESSARY CHANGE: Strengthened prompts to force Chain-of-Thought
            if mode == 'strict':
                sys_msg = (
                    "STRICT MODE: Use ONLY the provided manuscript. "
                    "You MUST think step-by-step inside <think> tags before answering. "
                    "If information isn't in the text, say you don't know."
                )
            else:
                sys_msg = (
                    "GLOBAL MODE: Use the manuscript + your knowledge. "
                    "You MUST think step-by-step inside <think> tags to compare your knowledge with the text."
                )

            payload = {
                "model": MODEL_ID,
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": f"MANUSCRIPT:\n{raw_context[:6000]}\n\nQUESTION: {user_q}"}
                ],
                "temperature": 0.6,
                "stream": True # Keeps connection alive to prevent Vercel 10s timeout
            }

            try:
                # Increased timeout to 90s to allow for deep 'thinking' time
                response = requests.post(
                    url="https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_KEY}", 
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    stream=True,
                    timeout=90 
                )

                for line in response.iter_lines():
                    if line:
                        decoded = line.decode('utf-8').replace('data: ', '')
                        if decoded == '[DONE]': 
                            break
                        try:
                            chunk = json.loads(decoded)
                            token = chunk['choices'][0]['delta'].get('content', '')
                            if token:
                                # Streams token back to React for real-time UI updates
                                yield f"data: {json.dumps({'token': token})}\n\n"
                        except: 
                            continue
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return Response(stream_with_context(generate()), mimetype='text/event-stream')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Local development fallback
    app.run(debug=False, port=5000)
