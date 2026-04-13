from locust import HttpUser, task, between, events
import random
import uuid

class SetkaUser(HttpUser):
    wait_time = between(1, 3) # Wait 1 to 3 seconds between tasks

    def on_start(self):
        # Fetch some groups to use for requests
        self.groups = []
        try:
            res = self.client.get("/groups", name="Init /groups")
            if res.status_code == 200:
                self.groups = [g['id'] for g in res.json().get('data', [])[:50]]
        except:
            pass

        if not self.groups:
            self.groups = [1, 2, 3, 4, 5]

        self.fcm_token = f"locust_user_{uuid.uuid4()}"

    @task(3)
    def view_schedule(self):
        group_id = random.choice(self.groups)
        self.client.get(f"/schedule/group/{group_id}", name="/schedule/group/[id]")

    @task(1)
    def view_search(self):
        self.client.get("/search?q=мат", name="/search")

    @task(1)
    def manage_subscription(self):
        group_id = random.choice(self.groups)

        # Subscribe
        self.client.post("/subscribe", json={
            "fcm_token": self.fcm_token,
            "entity_type": "group",
            "entity_id": group_id,
            "notify_on_change": True
        }, name="/subscribe")

        # Unsubscribe
        self.client.post("/unsubscribe", json={
            "fcm_token": self.fcm_token,
            "entity_type": "group",
            "entity_id": group_id
        }, name="/unsubscribe")

    @task(1)
    def download_ical(self):
         group_id = random.choice(self.groups)
         self.client.get(f"/schedule/group/{group_id}/ical", name="/schedule/group/[id]/ical")
