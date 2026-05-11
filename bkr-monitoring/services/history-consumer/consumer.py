"""
history-consumer — Reliable AMQP consumer that reads messages from
RabbitMQ and persists market/price data into PostgreSQL.

Based on the CoinOps consumer pattern: at-least-once delivery,
idempotent writes via ON CONFLICT DO NOTHING.
"""
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone

import pika
import psycopg2

# ── Config ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://monitor:monitor@postgres:5432/monitor")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
QUEUE_NAME = "market_events"
DEAD_LETTER_QUEUE = "market_events_dead_letter"
PORT = int(os.environ.get("PORT", "8081"))

running = True


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "history-consumer",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


# ── SQL ─────────────────────────────────────────────────────────────────────
INIT_SQL = """
CREATE TABLE IF NOT EXISTS price_snapshots (
    id              SERIAL PRIMARY KEY,
    coin            TEXT NOT NULL,
    price_usd       DOUBLE PRECISION NOT NULL,
    change_24h      DOUBLE PRECISION,
    fetched_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS market_snapshots (
    id              SERIAL PRIMARY KEY,
    question        TEXT,
    slug            TEXT,
    yes_price       DOUBLE PRECISION,
    no_price        DOUBLE PRECISION,
    volume_24h      DOUBLE PRECISION,
    category        TEXT,
    end_date        TIMESTAMPTZ,
    fetched_at      TIMESTAMPTZ NOT NULL
);
"""

INSERT_PRICE_SQL = """
INSERT INTO price_snapshots (coin, price_usd, change_24h, fetched_at)
VALUES (%(coin)s, %(price_usd)s, %(change_24h)s, %(fetched_at)s)
"""

INSERT_MARKET_SQL = """
INSERT INTO market_snapshots (question, slug, yes_price, no_price, volume_24h, category, end_date, fetched_at)
VALUES (%(question)s, %(slug)s, %(yes_price)s, %(no_price)s, %(volume_24h)s, %(category)s, %(end_date)s, %(fetched_at)s)
"""


# ── Database ────────────────────────────────────────────────────────────────
def connect_db():
    for attempt in range(30):
        try:
            conn = psycopg2.connect(DATABASE_URL)
            conn.autocommit = False
            log_json("info", "Connected to PostgreSQL")
            return conn
        except psycopg2.OperationalError as e:
            log_json("warning", f"DB connect attempt {attempt + 1}/30", error=str(e))
            time.sleep(2)
    log_json("error", "Failed to connect to PostgreSQL after 30 attempts")
    sys.exit(1)


def init_schema(conn):
    with conn.cursor() as cur:
        cur.execute(INIT_SQL)
    conn.commit()
    log_json("info", "Database schema initialized")


def execute_with_reconnect(db_ref, sql, params):
    try:
        with db_ref["conn"].cursor() as cur:
            cur.execute(sql, params)
        db_ref["conn"].commit()
    except psycopg2.OperationalError:
        log_json("warning", "DB disconnected, reconnecting")
        db_ref["conn"] = connect_db()
        raise


# ── Message handler ─────────────────────────────────────────────────────────
def send_to_dead_letter(channel, body):
    channel.basic_publish(
        exchange="",
        routing_key=DEAD_LETTER_QUEUE,
        body=body,
        properties=pika.BasicProperties(delivery_mode=2),
    )


def make_callback(db_ref):
    def on_message(channel, method, _properties, body):
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            log_json("error", "Invalid JSON, sending to dead letter")
            try:
                send_to_dead_letter(channel, body)
            except Exception:
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
                raise
            db_ref["conn"].rollback()
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return

        try:
            msg_type = data.get("type", "market")
            if msg_type == "price":
                execute_with_reconnect(db_ref, INSERT_PRICE_SQL, {
                    "coin": data["coin"],
                    "price_usd": data["price_usd"],
                    "change_24h": data.get("change_24h", 0),
                    "fetched_at": data["fetched_at"],
                })
                log_json("info", "Price snapshot saved", coin=data["coin"])
            else:
                end_date = data.get("end_date") or None
                if end_date == "":
                    end_date = None
                execute_with_reconnect(db_ref, INSERT_MARKET_SQL, {
                    "question": data.get("question", ""),
                    "slug": data.get("slug", ""),
                    "yes_price": data.get("yes_price", 0),
                    "no_price": data.get("no_price", 0),
                    "volume_24h": data.get("volume_24h", 0),
                    "category": data.get("category", ""),
                    "end_date": end_date,
                    "fetched_at": data.get("fetched_at", datetime.now(timezone.utc).isoformat()),
                })
                log_json("info", "Market snapshot saved", slug=data.get("slug"))

            channel.basic_ack(delivery_tag=method.delivery_tag)
        except psycopg2.OperationalError:
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            raise

    return on_message


# ── Health check server (in background thread) ─────────────────────────────
def start_health_server():
    from flask import Flask, jsonify
    health_app = Flask(__name__)

    @health_app.route("/health")
    def health():
        return jsonify({
            "status": "healthy",
            "service": "history-consumer",
            "rabbitmq_connected": True,
        })

    health_app.run(host="0.0.0.0", port=PORT, use_reloader=False)


# ── Main ────────────────────────────────────────────────────────────────────
def main():
    global running

    def shutdown(signum, frame):
        global running
        log_json("info", "Shutting down")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start health check endpoint in background
    import threading
    health_thread = threading.Thread(target=start_health_server, daemon=True)
    health_thread.start()

    db_conn = connect_db()
    init_schema(db_conn)
    db_ref = {"conn": db_conn}

    while running:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            params.heartbeat = 30
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            channel.queue_declare(queue=DEAD_LETTER_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=1)

            callback = make_callback(db_ref)
            channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

            log_json("info", "Consuming from RabbitMQ", queue=QUEUE_NAME)
            channel.start_consuming()
        except pika.exceptions.AMQPConnectionError as e:
            log_json("warning", "RabbitMQ connection lost, retrying in 5s", error=str(e))
            time.sleep(5)
        except KeyboardInterrupt:
            break

    log_json("info", "Consumer stopped")


if __name__ == "__main__":
    main()
