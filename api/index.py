import os
import requests
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 1. UPDATED: Pulling the Groq API key instead of OpenRouter
GROQ_KEY = os.getenv("GROQ_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not GROQ_KEY:
        # UPDATED: Error message reflects the new key
        return jsonify({"error": "GROQ_API_KEY missing in Environment Variables"}), 500

    try:
        data = request.get_json()
        # Fallback prompts if data is malformed
        prompt = data.get('prompt', 'Hello')
        context = data.get('context', '')
        
        # Reduced timeout to 15s to stay near Vercel limits
        response = requests.post(
            # 2. UPDATED: The new Groq API endpoint URL
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
                # 3. UPDATED: Removed "X-Title" as Groq doesn't need it
            },
            json={
                # 4. UPDATED: Swapped to Groq's fastest large model
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "user", "content": f"Context: {context}\n\nQuestion: {prompt}"}
                ]
            },
            timeout=15 
        )
        
        # Return the actual status from Groq if it's not 200
        if response.status_code != 200:
            return jsonify({"error": "Groq API Error", "details": response.text}), response.status_code

        return jsonify(response.json())

    except requests.exceptions.Timeout:
        return jsonify({"error": "AI took too long to respond. Try a shorter question."}), 504
    except Exception as e:
        # This will now show up in your browser console instead of a generic 500
        return jsonify({"error": str(e)}), 500
