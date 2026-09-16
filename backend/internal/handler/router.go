package handler

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"mini-erp/internal/middleware"
)

type Dependencies struct {
	SalesOrder    *SalesOrderHandler
	SalesDelivery *SalesDeliveryHandler
	SalesInvoice  *SalesInvoiceHandler
	SalesPayment  *SalesPaymentHandler
	Catalog       *CatalogHandler
}

func RegisterRoutes(r *gin.Engine, deps *Dependencies) {
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "X-Company-ID"},
	}))
	r.Use(middleware.CompanyScope())

	r.GET("/health", Health)

	r.GET("/companies", deps.Catalog.ListCompanies)
	r.GET("/brands", deps.Catalog.ListBrands)
	r.GET("/products", deps.Catalog.ListProducts)
	r.GET("/stocks", deps.Catalog.ListStocks)

	so := deps.SalesOrder
	r.POST("/sales-orders", so.Create)
	r.GET("/sales-orders", so.List)
	r.GET("/sales-orders/:id", so.Get)
	r.PUT("/sales-orders/:id", so.Update)
	r.DELETE("/sales-orders/:id", so.Delete)
	r.POST("/sales-orders/:id/submit", so.Submit)
	r.POST("/sales-orders/:id/unsubmit", so.Unsubmit)

	sd := deps.SalesDelivery
	r.POST("/sales-deliveries", sd.Create)
	r.GET("/sales-deliveries", sd.List)
	r.GET("/sales-deliveries/:id", sd.Get)
	r.PUT("/sales-deliveries/:id", sd.Update)
	r.DELETE("/sales-deliveries/:id", sd.Delete)
	r.POST("/sales-deliveries/:id/submit", sd.Submit)
	r.POST("/sales-deliveries/:id/unsubmit", sd.Unsubmit)

	si := deps.SalesInvoice
	r.POST("/sales-invoices", si.Create)
	r.GET("/sales-invoices", si.List)
	r.GET("/sales-invoices/:id", si.Get)
	r.PUT("/sales-invoices/:id", si.Update)
	r.DELETE("/sales-invoices/:id", si.Delete)
	r.POST("/sales-invoices/:id/submit", si.Submit)
	r.POST("/sales-invoices/:id/unsubmit", si.Unsubmit)

	sp := deps.SalesPayment
	r.POST("/sales-payments", sp.Create)
	r.GET("/sales-payments", sp.List)
	r.GET("/sales-payments/:id", sp.Get)
	r.PUT("/sales-payments/:id", sp.Update)
	r.DELETE("/sales-payments/:id", sp.Delete)
	r.POST("/sales-payments/:id/submit", sp.Submit)
	r.POST("/sales-payments/:id/unsubmit", sp.Unsubmit)
}
