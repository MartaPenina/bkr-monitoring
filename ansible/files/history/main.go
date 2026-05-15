package main

import (
	"database/sql"  // standard Go library for database operations
	"fmt"           // for printing messages
	"log"           // for printing errors and stopping program

	amqp "github.com/rabbitmq/amqp091-go"  // RabbitMQ library
	_ "github.com/lib/pq"                   // PostgreSQL driver
)

// Connection settings stored as constants
const (
	// RabbitMQ connection: amqp://user:password@host:port/
	RABBITMQ_URL = "amqp://history_user:history_password@192.168.0.105:5672/"
	// PostgreSQL connection details
	POSTGRES_URL = "host=192.168.0.108 user=history_user password=history_password dbname=coin_rates sslmode=disable"
)

func main() {
	// Step 1: Connect to PostgreSQL
	db, err := sql.Open("postgres", POSTGRES_URL)
	if err != nil {
		log.Fatal("Failed to connect to PostgreSQL:", err) // stop program if can't connect
	}
	defer db.Close() // close connection when program ends

	// Step 2: Create table if it doesn't exist yet
	// This runs every time but only creates table once
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS rates (
		id SERIAL PRIMARY KEY,        -- auto-incremented unique ID
		data TEXT,                     -- stores the rates data as text
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- auto-saves time of insert
	)`)
	if err != nil {
		log.Fatal("Failed to create table:", err)
	}
	fmt.Println("Connected to PostgreSQL!")

	// Step 3: Connect to RabbitMQ
	conn, err := amqp.Dial(RABBITMQ_URL)
	if err != nil {
		log.Fatal("Failed to connect to RabbitMQ:", err)
	}
	defer conn.Close()

	// Step 4: Open a channel (like a session inside the connection)
	ch, err := conn.Channel()
	if err != nil {
		log.Fatal("Failed to open channel:", err)
	}
	defer ch.Close()

	// Step 5: Declare the same queue "rates" that proxy_service sends to
	q, err := ch.QueueDeclare("rates", false, false, false, false, nil)
	if err != nil {
		log.Fatal("Failed to declare queue:", err)
	}

	// Step 6: Start consuming (listening) messages from the queue
	msgs, err := ch.Consume(q.Name, "", true, false, false, false, nil)
	if err != nil {
		log.Fatal("Failed to consume:", err)
	}

	fmt.Println("Waiting for messages from RabbitMQ...")

	// Step 7: Loop forever - process each message as it arrives
	for msg := range msgs {
		data := string(msg.Body) // convert message bytes to string
		// Save to PostgreSQL
		_, err = db.Exec("INSERT INTO rates (data) VALUES ($1)", data)
		if err != nil {
			log.Println("Failed to insert:", err) // log error but keep running
		} else {
			fmt.Println("Saved to database:", data[:50]) // print first 50 chars
		}
	}
}
