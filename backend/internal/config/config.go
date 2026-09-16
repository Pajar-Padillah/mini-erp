package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseDSN string
	AutoMigrate bool
}

func Load() Config {
	_ = godotenv.Load()
	return Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseDSN: getEnv("DB_DSN", "host=localhost user=erp password=erp dbname=mini_erp port=5432 sslmode=disable"),
		AutoMigrate: getEnv("AUTO_MIGRATE", "false") == "true",
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
