package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"mini-erp/internal/middleware"
	"mini-erp/internal/repository"
)

type CatalogHandler struct {
	companyRepo *repository.CompanyRepository
	brandRepo   *repository.BrandRepository
	productRepo *repository.ProductRepository
	stockRepo   *repository.StockRepository
}

func NewCatalogHandler(
	companyRepo *repository.CompanyRepository,
	brandRepo *repository.BrandRepository,
	productRepo *repository.ProductRepository,
	stockRepo *repository.StockRepository,
) *CatalogHandler {
	return &CatalogHandler{companyRepo: companyRepo, brandRepo: brandRepo, productRepo: productRepo, stockRepo: stockRepo}
}

func (h *CatalogHandler) ListCompanies(c *gin.Context) {
	rows, err := h.companyRepo.List()
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *CatalogHandler) ListBrands(c *gin.Context) {
	rows, err := h.brandRepo.List()
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *CatalogHandler) ListProducts(c *gin.Context) {
	rows, err := h.productRepo.List()
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *CatalogHandler) ListStocks(c *gin.Context) {
	companyID := middleware.CompanyIDFromContext(c)
	rows, err := h.stockRepo.List(companyID)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}
