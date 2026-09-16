package dbmigrate

import (
	"github.com/golang-migrate/migrate/v4"
	migratepostgres "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"gorm.io/gorm"
)

func newMigrator(db *gorm.DB, migrationsDir string) (*migrate.Migrate, error) {
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	driver, err := migratepostgres.WithInstance(sqlDB, &migratepostgres.Config{})
	if err != nil {
		return nil, err
	}
	return migrate.NewWithDatabaseInstance("file://"+migrationsDir, "postgres", driver)
}

func Run(db *gorm.DB, migrationsDir string) error {
	m, err := newMigrator(db, migrationsDir)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}

func Down(db *gorm.DB, migrationsDir string, steps int) error {
	m, err := newMigrator(db, migrationsDir)
	if err != nil {
		return err
	}
	if err := m.Steps(-steps); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
