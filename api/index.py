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
        return jsonify({"error": "GROQ_API_KEY missing in Vercel Environment"}), 500

    try:
        data = request.get_json()
        
        # Pull everything separately
        system_instructions = data.get('systemPrompt', "You are a helpful literary assistant.")
        user_question = data.get('prompt', 'Hello')
        book_context = data.get('context', '')

        # THE FIX: Move rules to SYSTEM role and use Triple-Quotes for isolation
        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system", 
                        "content": (
                            f"{system_instructions} "
                            "STRICT RULES:\n"
                            "1. If translating: Provide the translated text ONLY. No dashes, no markers, no intro.\n"
                            "2. If answering: Use your knowledge to answer. NEVER repeat the manuscript context.\n"
                            "3. If greeting: Be a friendly human assistant.\n"
                            "4. Never output internal markers like '###' or '---'."
                        )
                    },
                    {
                        "role": "user", 
                        "content": f"REFER TO THIS TEXT:\n\"\"\"\n{book_context}\n\"\"\"\n\nUSER REQUEST: {user_question}"
                    }
                ],
                # Temperature 0.2 stops the AI from hallucinating dashes/rubbish
                "temperature": 0.2 
            },
            timeout=15 
        )
        
        if response.status_code != 200:
            return jsonify({"error": "Groq API Error", "details": response.text}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({"error": str(e)}), 500
