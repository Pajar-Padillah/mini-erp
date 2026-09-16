package dto

import "mini-erp/internal/repository"

type ListMeta struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"page_size"`
	TotalItems int64 `json:"total_items"`
}

func MetaFromPageResult(p repository.PageResult) ListMeta {
	return ListMeta{Page: p.Page, PageSize: p.PageSize, TotalItems: p.TotalItems}
}

type ErrorResponse struct {
	Error string `json:"error"`
}
