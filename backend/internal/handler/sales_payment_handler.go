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

type SalesPaymentHandler struct {
	svc *service.SalesPaymentService
}

func NewSalesPaymentHandler(svc *service.SalesPaymentService) *SalesPaymentHandler {
	return &SalesPaymentHandler{svc: svc}
}

func (h *SalesPaymentHandler) Create(c *gin.Context) {
	var req dto.CreateSalesPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	sp, err := h.svc.CreateDraft(req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, sp)
}

func (h *SalesPaymentHandler) Get(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	sp, err := h.svc.Get(id, middleware.CompanyIDFromContext(c))
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sp)
}

func (h *SalesPaymentHandler) Update(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	var req dto.UpdateSalesPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	sp, err := h.svc.Update(id, req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sp)
}

func (h *SalesPaymentHandler) List(c *gin.Context) {
	companyID := middleware.CompanyIDFromContext(c)
	status := c.Query("status")
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	rows, pageResult, err := h.svc.List(companyID, status, repository.PageRequest{Page: page, PageSize: pageSize})
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "meta": dto.MetaFromPageResult(pageResult)})
}

func (h *SalesPaymentHandler) Submit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	sp, err := h.svc.Submit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sp)
}

func (h *SalesPaymentHandler) Unsubmit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	sp, err := h.svc.Unsubmit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sp)
}

func (h *SalesPaymentHandler) Delete(c *gin.Context) {
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
