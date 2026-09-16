package repository

import (
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mini-erp/internal/model"
)

type DocumentNumberRepository struct{ db *gorm.DB }

func NewDocumentNumberRepository(db *gorm.DB) *DocumentNumberRepository {
	return &DocumentNumberRepository{db}
}

func (r *DocumentNumberRepository) Next(tx *gorm.DB, companyID uint, docType model.DocType, companyCode string) (string, error) {
	if err := tx.Exec(
		`INSERT INTO document_number_sequences (company_id, doc_type, last_number)
		VALUES (?, ?, 0) ON CONFLICT (company_id, doc_type) DO NOTHING`,
		companyID, docType,
	).Error; err != nil {
		return "", err
	}

	var seq model.DocumentNumberSequence
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("company_id = ? AND doc_type = ?", companyID, docType).
		First(&seq).Error; err != nil {
		return "", err
	}

	seq.LastNumber++
	if err := tx.Model(&model.DocumentNumberSequence{}).
		Where("id = ?", seq.ID).
		Update("last_number", seq.LastNumber).Error; err != nil {
		return "", err
	}

	return fmt.Sprintf("%s-%s-%d-%06d", docType, companyCode, time.Now().Year(), seq.LastNumber), nil
}
