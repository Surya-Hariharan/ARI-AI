package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file from the root directory
	godotenv.Load("../../.env")

	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		log.Fatal("DATABASE_URL must be set in .env")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbUrl)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	files := []string{
		"001_initial_schema.sql",
		"002_auth_schema.sql",
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			log.Fatalf("Failed to read %s: %v", file, err)
		}

		fmt.Printf("Applying %s...\n", file)
		_, err = pool.Exec(ctx, string(content))
		if err != nil {
			log.Fatalf("Failed to apply %s: %v\n", file, err)
		}
		fmt.Printf("Successfully applied %s\n", file)
	}

	fmt.Println("All migrations applied successfully!")
}
