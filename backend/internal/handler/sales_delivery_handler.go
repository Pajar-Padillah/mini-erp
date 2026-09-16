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

type SalesDeliveryHandler struct {
	svc *service.SalesDeliveryService
}

func NewSalesDeliveryHandler(svc *service.SalesDeliveryService) *SalesDeliveryHandler {
	return &SalesDeliveryHandler{svc: svc}
}

func (h *SalesDeliveryHandler) Create(c *gin.Context) {
	var req dto.CreateSalesDeliveryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	sd, err := h.svc.CreateDraft(req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, sd)
}

func (h *SalesDeliveryHandler) Get(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	sd, err := h.svc.Get(id, middleware.CompanyIDFromContext(c))
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sd)
}

func (h *SalesDeliveryHandler) Update(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	var req dto.UpdateSalesDeliveryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: err.Error()})
		return
	}
	sd, err := h.svc.Update(id, req)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sd)
}

func (h *SalesDeliveryHandler) List(c *gin.Context) {
	companyID := middleware.CompanyIDFromContext(c)
	status := c.Query("status")
	var orderID uint
	if v := c.Query("sales_order_id"); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil {
			orderID = uint(id)
		}
	}
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	rows, pageResult, err := h.svc.List(companyID, orderID, status, repository.PageRequest{Page: page, PageSize: pageSize})
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "meta": dto.MetaFromPageResult(pageResult)})
}

func (h *SalesDeliveryHandler) Submit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	sd, err := h.svc.Submit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sd)
}

func (h *SalesDeliveryHandler) Unsubmit(c *gin.Context) {
	id, err := parseIDParam(c)
	if err != nil {
		return
	}
	sd, err := h.svc.Unsubmit(id)
	if err != nil {
		middleware.RespondError(c, err)
		return
	}
	c.JSON(http.StatusOK, sd)
}

func (h *SalesDeliveryHandler) Delete(c *gin.Context) {
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
