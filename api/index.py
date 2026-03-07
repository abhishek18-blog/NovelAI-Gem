import os
import requests
import json
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

GROQ_KEY = os.getenv("GROQ_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not GROQ_KEY:
        return jsonify({"error": "GROQ_API_KEY missing"}), 500

    try:
        data = request.get_json()
        user_q = data.get('prompt', '')
        raw_context = data.get('context', '')
        mode = data.get('mode', 'strict')

        # Use the specialized reasoning model
        MODEL_ID = "deepseek-r1-distill-llama-70b"

        def generate():
            # Instructions to force the model to stay in character
            sys_msg = (
                "You are a strict scholarly assistant. Use ONLY the provided manuscript. "
                "You must THINK step-by-step using <think> tags. If information is missing, admit it."
            ) if mode == 'strict' else "You are a literary analyst. Think then answer."

            payload = {
                "model": MODEL_ID,
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": f"CONTEXT:\n{raw_context[:5000]}\n\nQUESTION: {user_q}"}
                ],
                "temperature": 0.6,
                "stream": True # CRITICAL: Enables streaming tokens
            }

            response = requests.post(
                url="https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
                json=payload,
                stream=True
            )

            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8').replace('data: ', '')
                    if decoded_line == '[DONE]':
                        break
                    try:
                        chunk = json.loads(decoded_line)
                        token = chunk['choices'][0]['delta'].get('content', '')
                        if token:
                            # Send token to React
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    except:
                        continue

        return Response(stream_with_context(generate()), mimetype='text/event-stream')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
