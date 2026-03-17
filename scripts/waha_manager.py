import os
import sys
import requests
import json

def get_config():
    api_key = os.environ.get("WAHA_API_KEY")
    # Default to local proxied URL if not provided
    base_url = os.environ.get("WAHA_API_URL", "http://localhost:8080/waha")
    
    if not api_key:
        print("Error: WAHA_API_KEY environment variable is not set.")
        sys.exit(1)
        
    return base_url, api_key

def print_response(response):
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(f"Status: {response.status_code}")
        print(response.text)

def main():
    if len(sys.argv) < 2:
        print("Usage: python waha_manager.py [command] [session_name]")
        print("Commands: start, stop, status, qr, sessions")
        sys.exit(1)

    command = sys.argv[1]
    session_name = sys.argv[2] if len(sys.argv) > 2 else "default"
    base_url, api_key = get_config()
    
    headers = {
        "X-Api-Key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    if command == "sessions":
        print(f"Listing all sessions on {base_url}...")
        res = requests.get(f"{base_url}/api/sessions", headers=headers)
        print_response(res)

    elif command == "start":
        print(f"Starting session '{session_name}'...")
        payload = {"name": session_name}
        res = requests.post(f"{base_url}/api/sessions", headers=headers, json=payload)
        print_response(res)

    elif command == "stop":
        print(f"Stopping session '{session_name}'...")
        res = requests.delete(f"{base_url}/api/sessions/{session_name}", headers=headers)
        if res.status_code == 204 or res.status_code == 200:
            print("Successfully stopped.")
        else:
            print_response(res)

    elif command == "status":
        print(f"Checking status for '{session_name}'...")
        res = requests.get(f"{base_url}/api/sessions/{session_name}", headers=headers)
        print_response(res)

    elif command == "qr":
        print(f"Fetching QR code for '{session_name}'...")
        # Note: format=image returns binary, default returns JSON with base64/data
        res = requests.get(f"{base_url}/api/{session_name}/auth/qr", headers=headers)
        print_response(res)
        print(f"\nTip: To see the image directly, open {base_url}/api/{session_name}/auth/qr?format=image in your browser.")

    else:
        print(f"Unknown command: {command}")

if __name__ == "__main__":
    main()
