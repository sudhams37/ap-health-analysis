from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import sys

from chatbot.engine import HealthChatbot

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Initialize Chatbot
data_dir = os.path.join(os.path.dirname(__file__), 'data', 'raw')
chatbot = HealthChatbot(data_dir)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/data/<path:path>')
def serve_data(path):
    return send_from_directory('data', path)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({"error": "No message provided"}), 400
    
    result = chatbot.predict(user_message)
    return jsonify(result)
    
@app.route('/api/predictive', methods=['GET'])
def get_predictive():
    return jsonify(chatbot.get_predictive_data())

if __name__ == '__main__':
    print("[RUN] Starting Health AI Dashboard with Python Backend...")
    # host='0.0.0.0' allows access from other devices on the same network
    app.run(host='0.0.0.0', port=8000, debug=True)
