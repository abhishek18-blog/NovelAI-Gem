import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# This pulls the key you just added to the Vercel dashboard!
GROQ_KEY = os.getenv("GROQ_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    # If this error shows up, we know the new code is running but missing the key
    if not GROQ_KEY:
        return jsonify({"error": "GROQ_API_KEY missing in Environment Variables"}), 500

    try:
        data = request.get_json()
        prompt = data.get('prompt', 'Hello')
        context = data.get('context', '')
        
        # Calling the Groq API
        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "user", "content": f"Context: {context}\n\nQuestion: {prompt}"}
                ]
            },
            timeout=15 
        )
        
        if response.status_code != 200:
            return jsonify({"error": "Groq API Error", "details": response.text}), response.status_code

        return jsonify(response.json())

    except requests.exceptions.Timeout:
        return jsonify({"error": "AI took too long to respond. Try a shorter question."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500
