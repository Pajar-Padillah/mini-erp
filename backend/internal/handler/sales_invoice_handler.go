package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"mini-erp/internal/dto"
	"mini-erp/internal/middleware"
	"mini-erp/internal/repository"
	"mini-erp/internal/service"
)

type SalesInvoiceHandler struct {
	svc *service.SalesInvoiceService
}

func NewSalesInvoiceHandler(svc *service.SalesInvoiceService) *SalesInvoiceHandler {
	return &SalesInvoiceHandler{svc: svc}
}

func (h *SalesInvoiceHandler) Create(c *gin.Context) {
	var req dto.CreateSalesInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	si, err := h.svc.CreateDraft(req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, si)
}

func (h *SalesInvoiceHandler) Get(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	si, err := h.svc.Get(id, middleware.CompanyIDFromContext(c))
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, si)
}

func (h *SalesInvoiceHandler) Update(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	var req dto.UpdateSalesInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	si, err := h.svc.Update(id, req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, si)
}

func (h *SalesInvoiceHandler) List(c *gin.Context) {
	companyID := middleware.CompanyIDFromContext(c)
	status := c.Query("status")
	paymentStatus := c.Query("payment_status")
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	rows, pageResult, err := h.svc.List(companyID, status, paymentStatus, repository.PageRequest{Page: page, PageSize: pageSize})
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "meta": dto.MetaFromPageResult(pageResult)})
}

func (h *SalesInvoiceHandler) Submit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	si, err := h.svc.Submit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, si)
}

func (h *SalesInvoiceHandler) Unsubmit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	si, err := h.svc.Unsubmit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, si)
}

func (h *SalesInvoiceHandler) Delete(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	if err := h.svc.Delete(id); err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
