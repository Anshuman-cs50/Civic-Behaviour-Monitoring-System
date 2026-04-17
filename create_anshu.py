import requests

login_url = 'http://localhost:8000/auth/login'
enroll_url = 'http://localhost:8000/enroll'
image_path = r'D:\Civic-Behaviour-Monitoring-System\backend\venv\Lib\site-packages\ultralytics\assets\zidane.jpg'

try:
    # 1. Login to get token
    login_data = {'username': 'admin', 'password': 'cbms2026', 'consent': True}
    res = requests.post(login_url, json=login_data)
    token = res.json().get('token')
    
    # 2. Enroll
    with open(image_path, 'rb') as f:
        files = {'file': ('zidane.jpg', f, 'image/jpeg')}
        data = {'name': 'anshu'}
        headers = {'X-Auth-Token': token}
        response = requests.post(enroll_url, files=files, data=data, headers=headers)
        print(f'Status: {response.status_code}')
        print(f'Response: {response.text}')
except Exception as e:
    print(f'Error: {e}')
