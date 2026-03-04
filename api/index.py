import os
import io
import requests
import json # Added for payload handling
from flask import Flask, request, jsonify
from flask_cors import CORS
from bs4 import BeautifulSoup

# --- FIREBASE ADMIN SDK ---
try:
    import firebase_admin
    from firebase_admin import credentials, auth as admin_auth
    HAS_FIREBASE_ADMIN = True
except ImportError:
    HAS_FIREBASE_ADMIN = False

# Optional: PDF parsing support
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

app = Flask(__name__)

# Allow CORS for your React development server
CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}})

# --- OPENROUTER CONFIGURATION ---
# IMPORTANT: Add OPENROUTER_API_KEY to your environment variables
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY")

# --- FIREBASE INITIALIZATION ---
try:
    if HAS_FIREBASE_ADMIN and not firebase_admin._apps:
        firebase_admin.initialize_app()
except Exception as e:
    print(f"Firebase Admin initialization skipped or failed: {e}")

# --- ROUTES ---

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    """Secure Proxy for OpenRouter AI calls."""
    if not OPENROUTER_KEY:
        return jsonify({"error": "Backend API Key is missing. Check your .env file."}), 500

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    prompt = data.get('prompt')
    context = data.get('context', '')
    system_prompt = data.get('systemPrompt', 'You are a literary assistant.')

    try:
        # We call OpenRouter from HERE (Server-side)
        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:5173", # Optional for OpenRouter
                "X-Title": "NovelQuest"
            },
            data=json.dumps({
                "model": "meta-llama/llama-3.3-70b-instruct:free",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Context: {context}\n\nQuestion: {prompt}"}
                ]
            }),
            timeout=30
        )
        
        # Check if OpenRouter itself returned an error
        if response.status_code != 200:
            return jsonify({
                "error": f"OpenRouter rejected the key: {response.status_code}",
                "details": response.text
            }), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({"error": f"Backend failed to reach AI: {str(e)}"}), 500

# ... (Keep your existing process_link and process_pdf routes below) ...

@app.route('/api/process-link', methods=['POST'])
def process_link():
    # ... (Your existing code)
    pass

@app.route('/api/process-pdf', methods=['POST'])
def process_pdf():
    # ... (Your existing code)
    pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
