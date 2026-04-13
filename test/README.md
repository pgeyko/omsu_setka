# Testing

This directory contains test scripts for the omsu_mirror API.

## Requirements

To install the requirements, run the following command from the `test` directory:
```bash
pip install -r requirements.txt
```

## API Test

The `api_test_all.py` script tests the following functionality:
- Dictionaries (Groups, Tutors, Auditories)
- Schedule
- iCal Export
- Subscriptions and Notifications

To run the API test:
```bash
python3 api_test_all.py
```

## Load Test

The `load_test.py` script simulates 1000 concurrent users accessing the API.

To run the load test:
```bash
locust -f load_test.py --headless -u 1000 -r 100 -t 30s --host=http://localhost:8080/api/v1
```
