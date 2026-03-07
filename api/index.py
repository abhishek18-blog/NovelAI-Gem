import os
import requests
import re # Added for parsing tags
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
        # Specialized prompt for Literature Analysis
        sys_msg = data.get('systemPrompt', (
            "You are a literary critic and scholar. "
            "Analyze the provided text for themes, character development, and plot points. "
            "Always think through the narrative structure before answering."
        ))
        user_q = data.get('prompt', '')
        context = data.get('context', '')

        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-r1-distill-llama-70b",
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {
                        "role": "user", 
                        "content": f"LITERATURE PIECE:\n\"\"\"{context}\"\"\"\n\nANALYSIS REQUEST: {user_q}"
                    }
                ],
                "temperature": 0.6 # Essential for reasoning models to explore themes
            },
            timeout=90 # Analyzing literature takes more "thought" time
        )
        
        full_data = response.json()
        raw_content = full_data['choices'][0]['message']['content']

        # --- SEPARATING THOUGHT FROM ANSWER ---
        # DeepSeek puts its reasoning inside <think> tags.
        thought_process = ""
        final_answer = raw_content

        if "<think>" in raw_content:
            parts = raw_content.split("</think>")
            thought_process = parts[0].replace("<think>", "").strip()
            final_answer = parts[1].strip()

        return jsonify({
            "thought": thought_process, # You can show this in a "Thinking..." accordion in UI
            "answer": final_answer,
            "raw": raw_content
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
