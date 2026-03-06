import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 1. AUTHENTICATION: Pull the Groq API key from Vercel
GROQ_KEY = os.getenv("GROQ_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    # Safety check for the environment variable
    if not GROQ_KEY:
        return jsonify({
            "error": "GROQ_API_KEY missing in Vercel Variables"
        }), 500

    try:
        data = request.get_json()
        
        # 2. DATA EXTRACTION: Pull variables from your React frontend
        system_instructions = data.get('systemPrompt', "You are a helpful literary assistant.")
        user_question = data.get('prompt', 'Hello')
        book_context = data.get('context', '')

        # 3. CONSTRUCT THE PAYLOAD: Separate Roles for Llama 3
        # System Role = The "Master Rules" | User Role = The Book + The Question
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
                            f"{system_instructions}. "
                            "CRITICAL INSTRUCTIONS: "
                            "1. If asked to translate, return ONLY the translated text and nothing else. "
                            "2. If asked a question, answer it directly using the manuscript context or your general knowledge. "
                            "3. NEVER repeat the manuscript context text back to the user unless specifically asked for a summary. "
                            "4. If the user is just greeting you (Hi, Hello), be a friendly assistant."
                        )
                    },
                    {
                        "role": "user", 
                        "content": f"### MANUSCRIPT CONTEXT ###\n{book_context}\n\n### USER QUESTION ###\n{user_question}"
                    }
                ],
                # 4. PRECISION CONTROL: 
                # Temperature 0.1 is critical to stop hallucinations and copy-pasting.
                "temperature": 0.1, 
                "max_tokens": 1024
            },
            timeout=15 
        )
        
        # 5. RESPONSE HANDLING: 
        if response.status_code != 200:
            return jsonify({
                "error": "Groq API Error", 
                "details": response.text
            }), response.status_code

        return jsonify(response.json())

    # 6. ERROR HANDLING:
    except requests.exceptions.Timeout:
        return jsonify({"error": "AI took too long to respond."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500
