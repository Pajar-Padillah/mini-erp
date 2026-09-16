package service

import (
	"gorm.io/gorm"

	"mini-erp/internal/model"
	"mini-erp/internal/repository"
)

type NumberingService struct {
	docNumberRepo *repository.DocumentNumberRepository
	companyRepo   *repository.CompanyRepository
}

func NewNumberingService(docNumberRepo *repository.DocumentNumberRepository, companyRepo *repository.CompanyRepository) *NumberingService {
	return &NumberingService{docNumberRepo: docNumberRepo, companyRepo: companyRepo}
}

func (s *NumberingService) Next(tx *gorm.DB, companyID uint, docType model.DocType) (string, error) {
	company, err := s.companyRepo.FindByID(companyID)
	if err != nil {
		return "", err
	}
	return s.docNumberRepo.Next(tx, companyID, docType, company.Code)
}
