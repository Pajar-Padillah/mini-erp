package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"mini-erp/internal/dto"
)

func parseIDParam(c *gin.Context) (uint, error) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Error: "invalid id"})
		return 0, err
	}
	return uint(id), nil
}
