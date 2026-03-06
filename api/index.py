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
    # 1. Safety check: Ensure the server has access to your API key
    if not GROQ_KEY:
        return jsonify({
            "error": "GROQ_API_KEY missing in Environment Variables"
        }), 500

    try:
        data = request.get_json()
        
        # 2. Data Extraction: Provide default values if the frontend forgets a key
        system_instructions = data.get('systemPrompt', "You are a helpful literary assistant.")
        user_question = data.get('prompt', 'Hello')
        book_context = data.get('context', '')

        # 3. Call the Groq API using the Role-Based Structure
        # System role = Instructions | User role = Data + Question
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
                        "content": f"{system_instructions} Important: If the answer is not in the text, use your own knowledge. Never just repeat the context text."
                    },
                    {
                        "role": "user", 
                        "content": f"### MANUSCRIPT CONTEXT ###\n{book_context}\n\n### USER QUESTION ###\n{user_question}"
                    }
                ],
                # Temperature 0.3 makes the AI factual and disciplined
                "temperature": 0.3
            },
            # 15s timeout to prevent Vercel function hangs
            timeout=15
        )
        
        # 4. Success Check: Return Groq's answer if status is 200 (OK)
        if response.status_code != 200:
            return jsonify({
                "error": "Groq API Error", 
                "details": response.text
            }), response.status_code

        return jsonify(response.json())

    # 5. Specific Error Handling
    except requests.exceptions.Timeout:
        return jsonify({
            "error": "AI took too long to respond. Try a shorter request."
        }), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500
