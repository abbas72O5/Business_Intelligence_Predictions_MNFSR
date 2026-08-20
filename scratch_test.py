import requests
import json

def test():
    # Login
    res = requests.post("http://localhost:8000/auth/login", json={"email": "admin@example.com", "password": "password123"})
    token = res.json()["access_token"]
    
    # Get tables
    tables = requests.get("http://localhost:8000/metadata/", headers={"Authorization": f"Bearer {token}"}).json()
    if not tables:
        print("No tables")
        return
        
    table_id = tables[0]["table_id"]
    cols = tables[0]["columns"]
    print(f"Table columns: {cols}")
    
    # Find a string and numeric
    x_col = next((c["name"] for c in cols if c["type"] == "String"), cols[0]["name"])
    y_col = next((c["name"] for c in cols if c["type"] in ["Integer", "Float"]), cols[1]["name"])
    
    print(f"Testing Bar Chart with X={x_col}, Y={y_col}")
    
    payload = {
        "table_id": table_id,
        "dataset_type": "table",
        "chart_type": "bar",
        "x_column": x_col,
        "y_column": y_col,
        "group_by": False
    }
    
    res = requests.post("http://localhost:8000/query/observations", json=payload, headers={"Authorization": f"Bearer {token}"})
    print(f"Status: {res.status_code}")
    print(res.text[:500])

if __name__ == "__main__":
    test()
