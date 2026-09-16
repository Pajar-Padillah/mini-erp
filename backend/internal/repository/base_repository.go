package repository

import "gorm.io/gorm"

type PageRequest struct {
	Page     int
	PageSize int
}

func (p PageRequest) Normalized() (page, pageSize, offset int) {
	page = p.Page
	if page < 1 {
		page = 1
	}
	pageSize = p.PageSize
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}
	offset = (page - 1) * pageSize
	return
}

type PageResult struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalItems int64 `json:"total_items"`
}

func ScopeToCompany(db *gorm.DB, companyID uint) *gorm.DB {
	return db.Where("company_id = ?", companyID)
}
