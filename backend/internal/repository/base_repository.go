package repository

import (
	"strings"

	"gorm.io/gorm"
)

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

// ScopeToCompany limits rows to the given company. When the company is a group,
// rows of all its branches are included as well.
func ScopeToCompany(db *gorm.DB, companyID uint) *gorm.DB {
	return db.Where("company_id IN (SELECT id FROM companies WHERE id = ? OR parent_id = ?)", companyID, companyID)
}

// WhereIn filters column by a comma-separated list of values, e.g. "DRAFT,ACTIVE".
func WhereIn(db *gorm.DB, column, csv string) *gorm.DB {
	var values []string
	for _, v := range strings.Split(csv, ",") {
		if v = strings.TrimSpace(v); v != "" {
			values = append(values, v)
		}
	}
	if len(values) == 0 {
		return db
	}
	return db.Where(column+" IN ?", values)
}
