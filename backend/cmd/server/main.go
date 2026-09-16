package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"mini-erp/internal/config"
	"mini-erp/internal/dbmigrate"
	"mini-erp/internal/handler"
	"mini-erp/internal/repository"
	"mini-erp/internal/service"
	"mini-erp/internal/transaction"
)

func main() {
	cfg := config.Load()

	db, err := gorm.Open(postgres.Open(cfg.DatabaseDSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	if cfg.AutoMigrate {
		if err := dbmigrate.Run(db, "migrations"); err != nil {
			log.Fatalf("failed to run migrations: %v", err)
		}
	}

	txManager := transaction.NewManager(db)

	companyRepo := repository.NewCompanyRepository(db)
	brandRepo := repository.NewBrandRepository(db)
	productRepo := repository.NewProductRepository(db)
	stockRepo := repository.NewStockRepository(db)
	docNumberRepo := repository.NewDocumentNumberRepository(db)
	orderRepo := repository.NewSalesOrderRepository(db)
	deliveryRepo := repository.NewSalesDeliveryRepository(db)
	invoiceRepo := repository.NewSalesInvoiceRepository(db)
	paymentRepo := repository.NewSalesPaymentRepository(db)

	numbering := service.NewNumberingService(docNumberRepo, companyRepo)
	stockService := service.NewStockService(stockRepo)
	orderService := service.NewSalesOrderService(txManager, orderRepo, numbering)
	deliveryService := service.NewSalesDeliveryService(txManager, deliveryRepo, orderRepo, numbering, stockService, orderService)
	invoiceService := service.NewSalesInvoiceService(txManager, invoiceRepo, deliveryRepo, numbering, deliveryService)
	paymentService := service.NewSalesPaymentService(txManager, paymentRepo, invoiceRepo, numbering, invoiceService)

	deps := &handler.Dependencies{
		SalesOrder:    handler.NewSalesOrderHandler(orderService),
		SalesDelivery: handler.NewSalesDeliveryHandler(deliveryService),
		SalesInvoice:  handler.NewSalesInvoiceHandler(invoiceService),
		SalesPayment:  handler.NewSalesPaymentHandler(paymentService),
		Catalog:       handler.NewCatalogHandler(companyRepo, brandRepo, productRepo, stockRepo),
	}

	r := gin.Default()
	handler.RegisterRoutes(r, deps)

	log.Printf("listening on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
