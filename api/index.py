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
        return jsonify({"error": "GROQ_API_KEY missing from server environment"}), 500

    try:
        data = request.get_json()
        # Specialized prompt for Literature/Story Analysis
        sys_msg = data.get('systemPrompt', (
            "You are a literary analysis expert. Use the provided text to answer questions. "
            "Think deeply about character motives and plot before answering. "
            "If the answer isn't in the text, say you don't know."
        ))
        user_q = data.get('prompt', 'Hello')
        context = data.get('context', '')

        # The API request to Groq
        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}", 
                "Content-Type": "application/json"
            },
            json={
                "model": "deepseek-r1-distill-llama-70b", # FIXED: Added the missing comma here
                "messages": [
                    {"role": "system", "content": sys_msg},
                    {
                        "role": "user", 
                        "content": f"MANUSCRIPT:\n\"\"\"{context}\"\"\"\n\nQUESTION: {user_q}"
                    }
                ],
                "temperature": 0.6,
                "top_p": 0.95
            },
            timeout=60 # Reasoning models need more time to 'think'
        )

        # Check if Groq returned an error (e.g., Rate Limit or Invalid Key)
        if response.status_code != 200:
            return jsonify({
                "error": "Groq API Error",
                "details": response.text
            }), response.status_code

        res_json = response.json()

        # Safety check: Ensure 'choices' exists before accessing it
        if "choices" in res_json:
            return jsonify(res_json)
        else:
            return jsonify({"error": "Unexpected API response format", "raw": res_json}), 500

    except Exception as e:
        # This catches Python crashes and tells you EXACTLY what went wrong
        print(f"Server Crash Error: {str(e)}")
        return jsonify({"error": f"Internal Server Error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
