
import os
import requests
from flask import Flask, request, jsonify
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
        sys_msg = data.get('systemPrompt', "You are a helpful assistant.")
        user_q = data.get('prompt', 'Hello')
        context = data.get('context', '')

        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
            json={
             "model": "deepseek-r1-distill-llama-70b"
                "messages": [
                    {
                        "role": "system", 
                        "content": f"{sys_msg} RULE: Answer the question directly. Never repeat context. Never use dashes or ### markers."
                    },
                    {
                        "role": "user", 
                        "content": f"MANUSCRIPT:\n\"\"\"{context}\"\"\"\n\nQUESTION: {user_q}"
                    }
                ],
                "temperature": 0.0, # 0.0 is the most stable setting possible
                "stop": ["###", "---", "MANUSCRIPT:"] # Prevents markers from leaking
            },
            timeout=15 
        )
        
        return jsonify(response.json())

    except Exception as e:
        return jsonify({"error": str(e)}), 500
