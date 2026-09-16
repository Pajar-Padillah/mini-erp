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

type SalesOrderHandler struct {
	svc *service.SalesOrderService
}

func NewSalesOrderHandler(svc *service.SalesOrderService) *SalesOrderHandler {
	return &SalesOrderHandler{svc: svc}
}

func (h *SalesOrderHandler) Create(c *gin.Context) {
	var req dto.CreateSalesOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	so, err := h.svc.CreateDraft(req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, so)
}

func (h *SalesOrderHandler) Update(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	var req dto.UpdateSalesOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	so, err := h.svc.Update(id, req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, so)
}

func (h *SalesOrderHandler) Get(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	so, err := h.svc.Get(id, middleware.CompanyIDFromContext(c))
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, so)
}

func (h *SalesOrderHandler) List(c *gin.Context) {
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

func (h *SalesOrderHandler) Submit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	so, err := h.svc.Submit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, so)
}

func (h *SalesOrderHandler) Unsubmit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	so, err := h.svc.Unsubmit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, so)
}

func (h *SalesOrderHandler) Delete(c *gin.Context) {
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
