#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse
import sys
import argparse
import time

# Default configuration
DEFAULT_BASE_URL = "http://localhost:8000"

users = [
    {"name": "Gandalf", "username": "gandalf", "email": "gandalf@fantasy.com", "position": "midfielder", "score": 9.5},
    {"name": "Frodo Baggins", "username": "frodo", "email": "frodo@fantasy.com", "position": "midfielder", "score": 7.0},
    {"name": "Samwise Gamgee", "username": "samwise", "email": "samwise@fantasy.com", "position": "defender", "score": 7.5},
    {"name": "Aragorn", "username": "aragorn", "email": "aragorn@fantasy.com", "position": "striker", "score": 9.0},
    {"name": "Legolas", "username": "legolas", "email": "legolas@fantasy.com", "position": "striker", "score": 8.8},
    {"name": "Gimli", "username": "gimli", "email": "gimli@fantasy.com", "position": "defender", "score": 8.5},
    {"name": "Boromir", "username": "boromir", "email": "boromir@fantasy.com", "position": "defender", "score": 8.2},
    {"name": "Saruman", "username": "saruman", "email": "saruman@fantasy.com", "position": "goalkeeper", "score": 8.8},
    {"name": "Galadriel", "username": "galadriel", "email": "galadriel@fantasy.com", "position": "midfielder", "score": 9.2},
    {"name": "Elrond", "username": "elrond", "email": "elrond@fantasy.com", "position": "midfielder", "score": 9.0},
    {"name": "Bilbo Baggins", "username": "bilbo", "email": "bilbo@fantasy.com", "position": "goalkeeper", "score": 7.0},
    {"name": "Gollum", "username": "gollum", "email": "gollum@fantasy.com", "position": "striker", "score": 6.5},
    {"name": "Sauron", "username": "sauron", "email": "sauron@fantasy.com", "position": "defender", "score": 9.5},
    {"name": "Arwen", "username": "arwen", "email": "arwen@fantasy.com", "position": "midfielder", "score": 8.0},
    {"name": "Eowyn", "username": "eowyn", "email": "eowyn@fantasy.com", "position": "striker", "score": 8.2},
    {"name": "Faramir", "username": "faramir", "email": "faramir@fantasy.com", "position": "midfielder", "score": 7.8},
    {"name": "Theoden", "username": "theoden", "email": "theoden@fantasy.com", "position": "defender", "score": 8.0},
    {"name": "Eomer", "username": "eomer", "email": "eomer@fantasy.com", "position": "striker", "score": 8.5},
    {"name": "Treebeard", "username": "treebeard", "email": "treebeard@fantasy.com", "position": "defender", "score": 8.8},
    {"name": "Radagast", "username": "radagast", "email": "radagast@fantasy.com", "position": "midfielder", "score": 7.5},
    {"name": "Witch King", "username": "witchking", "email": "witchking@fantasy.com", "position": "defender", "score": 9.0},
    {"name": "Smaug", "username": "smaug", "email": "smaug@fantasy.com", "position": "striker", "score": 9.5},
    {"name": "Thorin Oakenshield", "username": "thorin", "email": "thorin@fantasy.com", "position": "defender", "score": 8.5},
    {"name": "Balrog", "username": "balrog", "email": "balrog@fantasy.com", "position": "striker", "score": 9.2},
    {"name": "Isildur", "username": "isildur", "email": "isildur@fantasy.com", "position": "midfielder", "score": 8.5},
    {"name": "Celeborn", "username": "celeborn", "email": "celeborn@fantasy.com", "position": "midfielder", "score": 8.2}
]

def make_request(base_url, path, method="GET", data=None, headers=None):
    url = f"{base_url}{path}"
    if headers is None:
        headers = {}
    
    body = None
    if data:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as f:
            return json.loads(f.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # For register, 400 often means already exists
        if e.code == 400 and path == "/auth/register":
            raise e
        # Read body for better error message
        error_body = e.read().decode("utf-8")
        raise Exception(f"HTTP {e.code}: {e.reason} - {error_body}")

def seed(base_url):
    print(f"Targeting: {base_url}")
    
    # 1. Ensure Gandalf exists and get token
    print("Authenticating Gandalf...")
    token = None
    gandalf_id = None
    
    # Try login first
    try:
        login_res = make_request(base_url, "/auth/login", method="POST", data={"email": "gandalf@fantasy.com", "password": "1234"})
        token = login_res["token"]
        gandalf_id = login_res["user"]["id"]
        print(f"Gandalf logged in (ID: {gandalf_id})")
    except Exception:
        print("Gandalf login failed, trying to register...")
        try:
            res = make_request(base_url, "/auth/register", method="POST", data={
                "name": "Gandalf", "username": "gandalf", "email": "gandalf@fantasy.com", "password": "1234", "position": "midfielder"
            })
            gandalf_id = res["id"]
            login_res = make_request(base_url, "/auth/login", method="POST", data={"email": "gandalf@fantasy.com", "password": "1234"})
            token = login_res["token"]
            print(f"Gandalf registered and logged in (ID: {gandalf_id})")
        except Exception as e:
            # If register failed, he might exist with a different password or we just need to find his ID
            print(f"Gandalf registration failed: {e}")
            print("Attempting to find Gandalf via search...")
            try:
                # We need a token to search, but we don't have one. 
                # This is a chicken-egg problem if Gandalf exists but we don't know the password.
                # Assuming password is '1234' for everyone in this environment.
                # If login failed with '1234', we are in trouble.
                
                # Let's try to register another temporary admin to perform the search
                temp_email = f"temp_admin_{int(time.time())}@fantasy.com"
                reg_res = make_request(base_url, "/auth/register", method="POST", data={
                    "name": "Temp Admin", "username": f"temp_{int(time.time())}", "email": temp_email, "password": "1234"
                })
                log_res = make_request(base_url, "/auth/login", method="POST", data={"email": temp_email, "password": "1234"})
                temp_token = log_res["token"]
                search_res = make_request(base_url, f"/api/users/search?q=gandalf", headers={"Authorization": f"Token {temp_token}"})
                found = next((u for u in search_res if u["username"] == "gandalf"), None)
                if found:
                    gandalf_id = found["id"]
                    print(f"Found existing Gandalf ID: {gandalf_id}. PLEASE ENSURE PASSWORD IS '1234'")
                    # Now try to login again assuming password 1234
                    login_res = make_request(base_url, "/auth/login", method="POST", data={"email": "gandalf@fantasy.com", "password": "1234"})
                    token = login_res["token"]
                else:
                    print("Gandalf not found even after search.")
                    return
            except Exception as e2:
                print(f"CRITICAL: Could not setup Gandalf: {e2}")
                return

    headers = {"Authorization": f"Token {token}"}

    # 2. Create Organization
    print("Setting up 'Fantasy League' organization...")
    org_id = None
    try:
        # Check if it exists first by listing all organizations (if allowed)
        # Or just try to create and catch
        org_res = make_request(base_url, "/api/organizations", method="POST", data={"name": "Fantasy League"}, headers=headers)
        org_id = org_res["id"]
        print(f"Organization created (ID: {org_id}) with Gandalf as owner.")
    except Exception as e:
        print(f"Organization creation failed or it already exists: {e}")
        print("Searching for 'Fantasy League' in Gandalf's organizations...")
        try:
            user_orgs = make_request(base_url, f"/api/users/{gandalf_id}/organizations", headers=headers)
            fantasy_org = next((o for o in user_orgs if o["name"] == "Fantasy League"), None)
            if fantasy_org:
                org_id = fantasy_org["id"]
                print(f"Found existing 'Fantasy League' organization (ID: {org_id})")
            else:
                # If Gandalf doesn't have it, maybe someone else created it?
                # But Gandalf MUST be the owner for this script to work correctly with his token.
                print("Gandalf is not an admin of 'Fantasy League'.")
                # Try to find it globally if possible
                all_orgs = make_request(base_url, "/api/organizations", headers=headers)
                fantasy_org = next((o for o in all_orgs["data"] if o["name"] == "Fantasy League"), None)
                if fantasy_org:
                    org_id = fantasy_org["id"]
                    print(f"Found 'Fantasy League' (ID: {org_id}) but Gandalf might not be owner.")
                else:
                    print("Could not find or create organization.")
                    return
        except Exception as e:
            print(f"Failed to find organization: {e}")
            return

    # 3. Process all users
    print(f"Processing {len(users)} users...")
    
    # Fetch existing org members to avoid duplicates
    existing_members = []
    try:
        existing_members = make_request(base_url, f"/api/organizations/{org_id}/players", headers=headers)
        print(f"  (Found {len(existing_members)} existing members in org)")
    except Exception as e:
        print(f"  (Warning: Could not fetch existing members: {e})")

    existing_user_ids = {m["user_id"] for m in existing_members}

    for u in users:
        print(f"  > {u['name']}...", end=" ", flush=True)
        user_id = None
        
        # Try register
        try:
            res = make_request(base_url, "/auth/register", method="POST", data={
                "name": u["name"], "username": u["username"], "email": u["email"], "password": "1234", "position": u["position"]
            })
            user_id = res["id"]
        except Exception:
            # Try find existing via search
            try:
                search_res = make_request(base_url, f"/api/users/search?q={u['username']}", headers=headers)
                found = next((item for item in search_res if item["username"] == u["username"]), None)
                if found:
                    user_id = found["id"]
            except Exception:
                pass

        if user_id:
            if user_id in existing_user_ids:
                print("Already in org (skipped).")
                continue

            # Add to org as player
            try:
                make_request(base_url, "/api/players", method="POST", data={
                    "user_id": user_id,
                    "organization_id": org_id,
                    "grade": u["score"]
                }, headers=headers)
                print("Added to org.")
            except Exception as e:
                print(f"Error adding to org: {e}")
        else:
            print("Failed to identify user ID.")

    print("\nFantasy League setup complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed fantasy users and organization into Pelada App.")
    parser.add_argument("--url", default=DEFAULT_BASE_URL, help=f"Base URL of the API (default: {DEFAULT_BASE_URL})")
    args = parser.parse_args()
    
    seed(args.url)
