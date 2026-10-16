package service

import (
	"gorm.io/gorm"

	"mini-erp/internal/apperror"
	"mini-erp/internal/model"
)

func AssertSameCompany(childCompanyID, parentCompanyID uint) error {
	if childCompanyID != parentCompanyID {
		return apperror.Wrap(apperror.ErrCompanyMismatch, "referenced document belongs to a different company")
	}
	return nil
}

// SingleSourceCompany returns the company shared by all referenced source documents,
// or an error when they span more than one company.
func SingleSourceCompany(companyIDs []uint) (uint, error) {
	if len(companyIDs) == 0 {
		return 0, nil
	}
	for _, id := range companyIDs[1:] {
		if id != companyIDs[0] {
			return 0, apperror.Wrap(apperror.ErrCompanyMismatch, "all referenced documents must belong to the same company")
		}
	}
	return companyIDs[0], nil
}

// ResolveDerivedCompany decides which company owns a document derived from a source
// document (e.g. a delivery created from an order). The derived document follows its
// source, which must be the selected company itself or one of its branches when the
// selected company is a group.
func ResolveDerivedCompany(tx *gorm.DB, selectedCompanyID, sourceCompanyID uint) (uint, error) {
	if sourceCompanyID == 0 || sourceCompanyID == selectedCompanyID {
		return selectedCompanyID, nil
	}
	var source model.Company
	if err := tx.Select("id", "parent_id").First(&source, sourceCompanyID).Error; err != nil {
		return 0, err
	}
	if source.ParentID != nil && *source.ParentID == selectedCompanyID {
		return sourceCompanyID, nil
	}
	return 0, apperror.Wrap(apperror.ErrCompanyMismatch, "referenced document belongs to a different company")
}
