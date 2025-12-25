import os
import io
import requests
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

# Allow CORS for your React development server (default Vite port is 5173)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}})

# --- FIREBASE INITIALIZATION ---
try:
    if HAS_FIREBASE_ADMIN and not firebase_admin._apps:
        # If you have a service account file, uncomment the lines below:
        # cred = credentials.Certificate("path/to/serviceAccountKey.json")
        # firebase_admin.initialize_app(cred)
        firebase_admin.initialize_app()
except Exception as e:
    print(f"Firebase Admin initialization skipped or failed: {e}")

# --- HELPER FUNCTIONS ---

def verify_token():
    """Helper to verify Firebase ID Token from request headers."""
    if not HAS_FIREBASE_ADMIN:
        return None
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split('Bearer ')[1]
    try:
        decoded_token = admin_auth.verify_id_token(token)
        return decoded_token
    except Exception:
        return None

# --- ROUTES ---

@app.route('/')
def index():
    """Root route to prevent 404 when visiting the base URL."""
    return jsonify({
        "status": "online",
        "message": "Welcome to NovelQuest API. Use /api/ for health check.",
        "endpoints": {
            "health_check": "/api/",
            "process_link": "/api/process-link",
            "process_pdf": "/api/process-pdf"
        }
    })

@app.route('/api/', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "message": "NovelQuest API is running",
        "features": {
            "firebase_admin": HAS_FIREBASE_ADMIN,
            "pdf_parser": PyPDF2 is not None
        }
    })

@app.route('/api/process-link', methods=['POST'])
def process_link():
    """Scrapes text from a URL."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload received"}), 400
        
    url = data.get('url')
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove noisy elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            element.decompose()

        # Clean text extraction
        text = soup.get_text(separator=' ')
        lines = (line.strip() for line in text.splitlines())
        clean_text = '\n'.join(line for line in lines if line)
        
        title = soup.title.string if soup.title else url.split('/')[-1]
        
        return jsonify({
            "name": title[:60] if title else "Web Article",
            "content": clean_text[:12000] # Limit content length
        })

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Network error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/process-pdf', methods=['POST'])
def process_pdf():
    """Extracts text from an uploaded PDF file."""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    try:
        if PyPDF2:
            # Read PDF content
            pdf_stream = io.BytesIO(file.read())
            pdf_reader = PyPDF2.PdfReader(pdf_stream)
            text = ""
            # Only extract first 20 pages to avoid timeouts
            max_pages = min(len(pdf_reader.pages), 20)
            for i in range(max_pages):
                page_text = pdf_reader.pages[i].extract_text()
                if page_text:
                    text += page_text + "\n"
                    
            return jsonify({
                "name": file.filename,
                "content": text
            })
        else:
            return jsonify({"error": "PDF parser (PyPDF2) not installed"}), 500
    except Exception as e:
        return jsonify({"error": f"PDF Error: {str(e)}"}), 500

if __name__ == '__main__':
    # Run on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)