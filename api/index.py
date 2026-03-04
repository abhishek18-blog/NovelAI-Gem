import os
import requests
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Use a default empty string to prevent crashes if key is missing
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not OPENROUTER_KEY:
        return jsonify({"error": "API Key missing in Vercel Environment Variables"}), 500

    try:
        data = request.get_json()
        # Fallback prompts if data is malformed
        prompt = data.get('prompt', 'Hello')
        context = data.get('context', '')
        
        # Reduced timeout to 15s to stay near Vercel limits
        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "X-Title": "NovelQuest"
            },
            data=json.dumps({
                "model": "meta-llama/llama-3.3-70b-instruct:free",
                "messages": [
                    {"role": "user", "content": f"Context: {context}\n\nQuestion: {prompt}"}
                ]
            }),
            timeout=15 
        )
        
        # Return the actual status from OpenRouter if it's not 200
        if response.status_code != 200:
            return jsonify({"error": "OpenRouter Error", "details": response.text}), response.status_code

        return jsonify(response.json())

    except requests.exceptions.Timeout:
        return jsonify({"error": "AI took too long to respond. Try a shorter question."}), 504
    except Exception as e:
        # This will now show up in your browser console instead of a generic 500
        return jsonify({"error": str(e)}), 500
