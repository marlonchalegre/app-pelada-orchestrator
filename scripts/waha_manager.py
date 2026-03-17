import os
import sys
import json
import time
import urllib.request
import urllib.error

def get_config():
    api_key = os.environ.get("WAHA_API_KEY")
    base_url = os.environ.get("WAHA_API_URL", "http://localhost:8080/waha")
    
    if not api_key:
        print("Error: WAHA_API_KEY environment variable is not set.")
        sys.exit(1)
        
    return base_url.rstrip('/'), api_key

def make_request(url, method="GET", payload=None, headers=None):
    if headers is None:
        headers = {}
    
    data = None
    if payload:
        data = json.dumps(payload).encode('utf-8')
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            return status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 500, str(e)

def print_result(status, body):
    print(f"Status: {status}")
    if not body:
        print("(Empty response body)")
        return
    try:
        parsed = json.loads(body)
        print(json.dumps(parsed, indent=2))
    except:
        print(body)

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/waha_manager.py [command] [session_name]")
        print("Commands: ping, start, stop, restart, status, qr, screenshot, sessions")
        sys.exit(1)

    command = sys.argv[1]
    session_name = sys.argv[2] if len(sys.argv) > 2 else "default"
    base_url, api_key = get_config()
    
    headers = {
        "X-Api-Key": api_key,
        "Accept": "application/json"
    }

    if command == "ping":
        print(f"Pinging {base_url}/api/server/version ...")
        status, body = make_request(f"{base_url}/api/server/version", headers=headers)
        print_result(status, body)

    elif command == "sessions":
        print(f"Listing all sessions on {base_url}...")
        status, body = make_request(f"{base_url}/api/sessions", headers=headers)
        print_result(status, body)

    elif command == "start":
        print(f"Starting session '{session_name}'...")
        # Explicitly define engine and start=true for better reliability on ARM
        payload = {
            "name": session_name,
            "engine": "WEBJS",
            "start": True
        }
        status, body = make_request(f"{base_url}/api/sessions", method="POST", headers=headers, payload=payload)
        if status == 422:
            print(f"Session '{session_name}' already exists.")
        else:
            print_result(status, body)
            print("\nWaiting 10 seconds for initialization (ARM takes time)...")
            time.sleep(10)
            status, body = make_request(f"{base_url}/api/sessions/{session_name}", headers=headers)
            print("Current status:")
            print_result(status, body)

    elif command == "stop":
        print(f"Stopping session '{session_name}'...")
        status, body = make_request(f"{base_url}/api/sessions/{session_name}", method="DELETE", headers=headers)
        if status in [200, 204]:
            print("Successfully stopped/deleted.")
        else:
            print_result(status, body)

    elif command == "restart":
        print(f"Restarting session '{session_name}'...")
        print(f"1. Stopping '{session_name}'...")
        make_request(f"{base_url}/api/sessions/{session_name}", method="DELETE", headers=headers)
        
        print("Waiting 5 seconds for cleanup...")
        time.sleep(5)
        
        print(f"2. Starting '{session_name}'...")
        payload = {
            "name": session_name,
            "engine": "WEBJS",
            "start": True
        }
        status, body = make_request(f"{base_url}/api/sessions", method="POST", headers=headers, payload=payload)
        print_result(status, body)
        
        print("\nWaiting 10 seconds for initialization...")
        time.sleep(10)
        status, body = make_request(f"{base_url}/api/sessions/{session_name}", headers=headers)
        print(f"Final Status:")
        print_result(status, body)

    elif command == "status":
        print(f"Checking status for '{session_name}'...")
        status, body = make_request(f"{base_url}/api/sessions/{session_name}", headers=headers)
        print_result(status, body)

    elif command == "qr":
        print(f"Fetching QR code for '{session_name}'...")
        status, body = make_request(f"{base_url}/api/{session_name}/auth/qr", headers=headers)
        print_result(status, body)

    elif command == "screenshot":
        print(f"Taking screenshot for '{session_name}'...")
        status, body = make_request(f"{base_url}/api/{session_name}/auth/screenshot", headers=headers)
        print_result(status, body)

    else:
        print(f"Unknown command: {command}")

if __name__ == "__main__":
    main()
