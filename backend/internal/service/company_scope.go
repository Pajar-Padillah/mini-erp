package service

import "mini-erp/internal/apperror"

func AssertSameCompany(childCompanyID, parentCompanyID uint) error {
	if childCompanyID != parentCompanyID {
		return apperror.Wrap(apperror.ErrCompanyMismatch, "referenced document belongs to a different company")
	}
	return nil
}
