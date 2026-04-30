import subprocess
import webbrowser
import time
import os
import sys

# Move to the correct directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def start_flask():
    print("[START] Starting Health AI Dashboard with Python Backend...")
    # Run app.py using the current python interpreter
    return subprocess.Popen([sys.executable, "app.py"])

if __name__ == "__main__":
    flask_process = start_flask()
    
    # Give it a few seconds to start
    time.sleep(3)
    
    # Open the browser
    local_url = "http://localhost:8000"
    network_url = "http://10.26.80.106:8000"
    print(f"[INFO] Local Dashboard: {local_url}")
    print(f"[INFO] Network Dashboard: {network_url} (Share this with others on your Wi-Fi)")
    webbrowser.open(local_url)
    
    try:
        # Keep the main thread alive while flask is running
        flask_process.wait()
    except KeyboardInterrupt:
        print("Shutting down server...")
        flask_process.terminate()
