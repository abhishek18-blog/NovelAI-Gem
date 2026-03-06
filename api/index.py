import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Pull the Groq API key from your Vercel Environment Variables
GROQ_KEY = os.getenv("GROQ_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    # Safety check: Ensure the server has access to your API key
    if not GROQ_KEY:
        return jsonify({
            "error": "GROQ_API_KEY missing in Environment Variables"
        }), 500

    try:
        data = request.get_json()
        
        # 1. Data Extraction: Get instructions, question, and book context
        # We use .get() to provide default values if the frontend forgets a key
        system_instructions = data.get('systemPrompt', "You are a helpful literary assistant.")
        user_question = data.get('prompt', 'Hello')
        book_context = data.get('context', '')

        # 2. Call the Groq API using the Llama 3 structure
        # We place instructions in the 'system' role and data in the 'user' role
        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": system_instructions},
                    {
                        "role": "user", 
                        "content": f"MANUSCRIPT PAGE:\n{book_context}\n\nQUESTION: {user_question}"
                    }
                ],
                # Temperature 0.5 makes the AI more factual and less likely to wander
                "temperature": 0.5 
            },
            # 15s timeout to prevent Vercel function hangs
            timeout=15 
        )
        
        # 3. Success Check: Return Groq's answer if status is 200 (OK)
        if response.status_code != 200:
            return jsonify({
                "error": "Groq API Error", 
                "details": response.text
            }), response.status_code

        return jsonify(response.json())

    # 4. Specific Error Handling
    except requests.exceptions.Timeout:
        return jsonify({
            "error": "AI took too long to respond. Try a shorter request."
        }), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500
