import requests
import json
import uuid
import os

BASE_URL = "http://localhost:8080/api/v1"

def test_api():
    print("Testing API endpoints...")

    # 1. Dictionaries
    print("\n--- Dictionaries ---")
    res = requests.get(f"{BASE_URL}/groups")
    print("Groups:", res.status_code, "OK" if res.status_code == 200 else "ERROR")

    if res.status_code == 200 and res.json().get('data'):
        groups = res.json().get('data', [])
        print(f"Found {len(groups)} groups")
        if groups:
            group_id = groups[0].get('id')
            res = requests.get(f"{BASE_URL}/groups/{group_id}")
            print(f"Group {group_id}:", res.status_code, "OK" if res.status_code == 200 else "ERROR")

    res = requests.get(f"{BASE_URL}/tutors")
    print("Tutors:", res.status_code, "OK" if res.status_code == 200 else "ERROR")

    # 2. Schedule
    print("\n--- Schedule ---")
    res = requests.get(f"{BASE_URL}/groups")
    groups = res.json().get('data', [])
    if groups:
        group_id = groups[0].get('id')
        res = requests.get(f"{BASE_URL}/schedule/group/{group_id}")
        print(f"Schedule for group {group_id}:", res.status_code, "OK" if res.status_code == 200 else "ERROR")

        # Test iCal export
        res = requests.get(f"{BASE_URL}/schedule/group/{group_id}/ical")
        print(f"iCal export for group {group_id}:", res.status_code, "OK" if res.status_code == 200 else "ERROR")
        if res.status_code == 200:
            print("iCal output preview:")
            print("\n".join(res.text.split("\n")[:5]))

    # 3. Subscriptions and Notifications
    print("\n--- Subscriptions ---")
    test_token = f"test_token_{uuid.uuid4()}"
    group_id = 1

    sub_data = {
        "fcm_token": test_token,
        "entity_type": "group",
        "entity_id": group_id,
        "notify_on_change": True,
        "notify_daily_digest": True,
        "digest_time": "20:00",
        "notify_before_lesson": True,
        "before_minutes": 15,
        "timezone": "Europe/Moscow"
    }

    res = requests.post(f"{BASE_URL}/subscribe", json=sub_data)
    print("Subscribe:", res.status_code, "OK" if res.status_code == 200 else "ERROR", res.text)

    # Test update settings
    sub_data["notify_before_lesson"] = False
    res = requests.patch(f"{BASE_URL}/notifications/settings", json=sub_data)
    print("Update settings:", res.status_code, "OK" if res.status_code == 200 else "ERROR", res.text)

    # Get settings
    res = requests.get(f"{BASE_URL}/notifications/settings/group/{group_id}?token={test_token}")
    print("Get settings:", res.status_code, "OK" if res.status_code == 200 else "ERROR", res.text)

    # Unsubscribe
    unsub_data = {
        "fcm_token": test_token,
        "entity_type": "group",
        "entity_id": group_id
    }
    res = requests.post(f"{BASE_URL}/unsubscribe", json=unsub_data)
    print("Unsubscribe:", res.status_code, "OK" if res.status_code == 200 else "ERROR", res.text)

if __name__ == '__main__':
    test_api()
