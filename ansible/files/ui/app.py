from flask import Flask, jsonify, send_from_directory
import psycopg2
import json
import os

app = Flask(__name__, static_folder='/home/penina/coin-rates-ui/dist', static_url_path='')

POSTGRES = {
    "host": "192.168.0.108",
    "database": "coin_rates",
    "user": "history_user",
    "password": "history_password"
}

@app.route("/")
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route("/api/history")
def get_history():
    conn = psycopg2.connect(**POSTGRES)
    cursor = conn.cursor()
    cursor.execute("SELECT id, created_at, data FROM rates ORDER BY created_at DESC LIMIT 50")
    records = cursor.fetchall()
    cursor.close()
    conn.close()
    result = []
    for r in records:
        result.append({
            "id": r[0],
            "created_at": str(r[1]),
            "data": r[2]
        })
    return jsonify(result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
