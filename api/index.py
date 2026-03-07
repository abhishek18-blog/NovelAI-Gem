import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)

# Enabling CORS allows your React frontend (usually on port 5173) 
# to talk to this Python backend (usually on port 5000)
CORS(app)

# Ensure your GROQ_API_KEY is set in your environment variables
GROQ_KEY = os.getenv("GROQ_API_KEY", "")

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    """
    Main endpoint for Novel Quest. 
    Receives manuscript context and user questions.
    """
    if not GROQ_KEY:
        return jsonify({"error": "GROQ_API_KEY is not set on the server."}), 500

    try:
        data = request.get_json()
        
        # Extract inputs from the React frontend
        system_prompt = data.get('systemPrompt', "You are a literary scholar.")
        user_query = data.get('prompt', '')
        context_text = data.get('context', '')

        # Construct the Groq API call
        # We use the deepseek-r1-distill-llama-70b for reasoning
        response = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_KEY}", 
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system", 
                        "content": f"{system_prompt} Answer based strictly on the provided manuscript. Think deeply before replying."
                    },
                    {
                        "role": "user", 
                        "content": f"MANUSCRIPT CONTEXT:\n\"\"\"{context_text}\"\"\"\n\nUSER QUESTION: {user_query}"
                    }
                ],
                "temperature": 0.6, # Recommended for reasoning models
                "top_p": 0.95
            },
            timeout=90 # Reasoning takes time; don't let the connection drop!
        )

        # Handle API Errors (e.g., Rate Limits)
        if response.status_code != 200:
            return jsonify({
                "error": "Groq API Error", 
                "details": response.text
            }), response.status_code

        res_json = response.json()
        raw_content = res_json['choices'][0]['message']['content']

        # --- REASONING EXTRACTION LOGIC ---
        # DeepSeek-R1 outputs reasoning inside <think>...</think> tags.
        # We split these so the frontend can display them separately.
        thought_process = ""
        final_answer = raw_content

        if "<think>" in raw_content:
            try:
                # Splitting by the closing tag
                parts = raw_content.split("</think>")
                # The part before </think> is the "thought"
                thought_process = parts[0].replace("<think>", "").strip()
                # The part after </think> is the "answer"
                final_answer = parts[1].strip()
            except IndexError:
                # Fallback if the model cuts off
                final_answer = raw_content

        return jsonify({
            "answer": final_answer,
            "thought": thought_process
        })

    except Exception as e:
        print(f"Server Error: {str(e)}")
        return jsonify({"error": f"Internal Server error: {str(e)}"}), 500

if __name__ == '__main__':
    # Running on port 5000 by default
    app.run(debug=True, port=5000)
