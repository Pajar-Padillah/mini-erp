package middleware

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

const CompanyIDContextKey = "company_id"

func CompanyScope() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.GetHeader("X-Company-ID")
		if raw == "" {
			raw = c.Query("company_id")
		}
		if raw != "" {
			if id, err := strconv.ParseUint(raw, 10, 64); err == nil {
				c.Set(CompanyIDContextKey, uint(id))
			}
		}
		c.Next()
	}
}

func CompanyIDFromContext(c *gin.Context) uint {
	if v, ok := c.Get(CompanyIDContextKey); ok {
		if id, ok := v.(uint); ok {
			return id
		}
	}
	return 0
}
