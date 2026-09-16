package middleware

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mini-erp/internal/apperror"
	"mini-erp/internal/dto"
)

func RespondError(c *gin.Context, err error) {
	status := apperror.HTTPStatus(err)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		status = http.StatusNotFound
	}
	c.JSON(status, dto.ErrorResponse{Error: err.Error()})
}

func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{Error: "internal server error"})
	})
}
