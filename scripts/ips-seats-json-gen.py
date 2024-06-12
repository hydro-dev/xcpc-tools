import requests
import base64
import json

auth = 'admin:admin'

req = requests.get('http://SERVER:5283/monitor', headers={'Authorization': 'Basic ' + base64.b64encode(auth.encode()).decode()})
reqjson = req.json()

ips = []

seats = {}

for i in reqjson['monitors']:
    if reqjson['monitors'][i]['ip'].startswith('192.'):
        ips.append(reqjson['monitors'][i]['ip'])
        seats[reqjson['monitors'][i]['hostname']] = reqjson['monitors'][i]['ip']


with open("ips.json", "w") as f:
    f.write(json.dumps(ips, indent=2))

with open("seats.json", "w") as f:
    f.write(json.dumps(seats, indent=2))