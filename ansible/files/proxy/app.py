from flask import Flask, jsonify
from flask_cors import CORS
import requests
import pika
import time

app = Flask(__name__)
CORS(app)

RABBITMQ_HOST = "192.168.0.105"
RABBITMQ_USER = "proxy_user"
RABBITMQ_PASS = "proxy_password"

# Cache storage
_cache = {"data": None, "timestamp": 0}
CACHE_TTL = 25  # seconds

def send_to_queue(data):
    try:
        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(host=RABBITMQ_HOST, credentials=credentials)
        )
        channel = connection.channel()
        channel.queue_declare(queue="rates")
        channel.basic_publish(exchange="", routing_key="rates", body=str(data))
        connection.close()
    except Exception as e:
        print(f"RabbitMQ error: {e}")

@app.route("/rates", methods=["GET"])
def get_rates():
    now = time.time()

    # Return cached data if still fresh
    if _cache["data"] and (now - _cache["timestamp"]) < CACHE_TTL:
        print("Serving from cache")
        return jsonify(_cache["data"])

    # Fetch fresh data
    try:
        crypto = requests.get(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,uah",
            timeout=5
        ).json()
        currency = requests.get(
            "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json",
            timeout=5
        ).json()
        data = {"crypto": crypto, "currency": currency}

        # Update cache
        _cache["data"] = data
        _cache["timestamp"] = now

        send_to_queue(data)
        return jsonify(data)

    except Exception as e:
        # If fetch fails but we have old cache, return it
        if _cache["data"]:
            print(f"Fetch failed, serving stale cache: {e}")
            return jsonify(_cache["data"])
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
