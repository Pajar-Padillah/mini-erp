package main

import (
	"flag"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"mini-erp/internal/config"
	"mini-erp/internal/dbmigrate"
)

func main() {
	down := flag.Bool("down", false, "roll back instead of applying migrations")
	steps := flag.Int("steps", 1, "number of migrations to roll back (only with -down)")
	flag.Parse()

	cfg := config.Load()
	db, err := gorm.Open(postgres.Open(cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	if *down {
		if *steps <= 0 {
			log.Fatalf("-steps must be > 0, got %d", *steps)
		}
		if err := dbmigrate.Down(db, "migrations", *steps); err != nil {
			log.Fatalf("migration rollback failed: %v", err)
		}
		log.Printf("rolled back %d migration(s)", *steps)
		return
	}

	if err := dbmigrate.Run(db, "migrations"); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	log.Println("migrations applied")
}
