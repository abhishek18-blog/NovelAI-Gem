import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

GROQ_KEY = os.getenv("GROQ_API_KEY", "")

def get_optimized_context(text, max_chars=5000):
    """Truncates text to roughly 1200-1500 tokens to keep things fast."""
    return text[:max_chars] + "..." if len(text) > max_chars else text

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not GROQ_KEY:
        return jsonify({"error": "GROQ_API_KEY missing"}), 500

    try:
        data = request.get_json()
        user_q = data.get('prompt', '')
        raw_context = data.get('context', '')
        mode = data.get('mode', 'strict') # 'strict' (PDF only) or 'global' (AI brain)

        # Optimize the context before sending to Groq
        context = get_optimized_context(raw_context)

        if mode == 'strict':
            sys_msg = "STRICT MODE: Use ONLY the provided text. If not there, say you don't know. NO external facts."
            temp = 0.0
        else:
            sys_msg = "GLOBAL MODE: Use the text as a primary source, but feel free to use your own knowledge."
            temp = 0.7

        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": f"CONTEXT:\n{context}\n\nQUESTION: {user_q}"}
                ],
                "temperature": temp,
                "max_tokens": 1024
            },
            timeout=10 # Perfect for Vercel Hobby tier
        )

        res_json = response.json()
        return jsonify({
            "answer": res_json['choices'][0]['message']['content'],
            "thought": f"Optimized context sent in {mode} mode."
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
