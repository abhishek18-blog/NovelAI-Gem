import os
import io
import requests
import json
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

# UPDATED: Relaxed CORS for production. 
# Vercel handles the same-origin requests automatically, 
# but this ensures no blocks occur.
CORS(app)

# Vercel Environment Variable (Add this in Vercel Dashboard)
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY")

# --- FIREBASE INITIALIZATION ---
try:
    if HAS_FIREBASE_ADMIN and not firebase_admin._apps:
        firebase_admin.initialize_app()
except Exception as e:
    print(f"Firebase Admin initialization skipped: {e}")

# --- AI ROUTE ---

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not OPENROUTER_KEY:
        return jsonify({"error": "Backend API Key is missing in Vercel settings."}), 500

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data received"}), 400

    prompt = data.get('prompt')
    context = data.get('context', '')
    system_prompt = data.get('systemPrompt', 'You are a literary assistant.')

    try:
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
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Context: {context}\n\nQuestion: {prompt}"}
                ]
            }),
            timeout=30
        )
        
        if response.status_code != 200:
            return jsonify({
                "error": f"OpenRouter Error: {response.status_code}",
                "details": response.text
            }), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({"error": f"Backend failed to reach AI: {str(e)}"}), 500

# --- OTHER ROUTES (Ensure they start with /api/) ---

@app.route('/api/process-link', methods=['POST'])
def process_link():
    # ... your existing logic ...
    return jsonify({"message": "Link processing placeholder"})

@app.route('/api/process-pdf', methods=['POST'])
def process_pdf():
    # ... your existing logic ...
    return jsonify({"message": "PDF processing placeholder"})

# IMPORTANT: For Vercel, the app object itself is the entry point.
# You don't actually need the __main__ block for production, 
# but it's fine to keep for local testing.
if __name__ == '__main__':
    app.run(debug=True)
