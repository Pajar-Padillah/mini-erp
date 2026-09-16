package integration

import (
	"os"
	"sync"
	"testing"

	"github.com/shopspring/decimal"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"mini-erp/internal/dbmigrate"
	"mini-erp/internal/model"
	"mini-erp/internal/repository"
	"mini-erp/internal/service"
	"mini-erp/internal/transaction"
)

var migrateOnce sync.Once

func testDSN() string {
	if v := os.Getenv("TEST_DB_DSN"); v != "" {
		return v
	}
	return "host=localhost user=erp password=erp dbname=mini_erp_test port=5544 sslmode=disable"
}

type testEnv struct {
	db              *gorm.DB
	orderService    *service.SalesOrderService
	deliveryService *service.SalesDeliveryService
	invoiceService  *service.SalesInvoiceService
	paymentService  *service.SalesPaymentService
	stockRepo       *repository.StockRepository
}

func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	db, err := gorm.Open(postgres.Open(testDSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	migrateOnce.Do(func() { runMigrations(t, db) })
	truncateAll(t, db)

	txManager := transaction.NewManager(db)
	companyRepo := repository.NewCompanyRepository(db)
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

	return &testEnv{
		db:              db,
		orderService:    orderService,
		deliveryService: deliveryService,
		invoiceService:  invoiceService,
		paymentService:  paymentService,
		stockRepo:       stockRepo,
	}
}

func runMigrations(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := dbmigrate.Run(db, "../../migrations"); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}
}

func truncateAll(t *testing.T, db *gorm.DB) {
	t.Helper()
	tables := []string{
		"sales_payment_allocations", "sales_payments",
		"sales_invoice_items", "sales_invoices",
		"sales_delivery_items", "sales_deliveries",
		"sales_order_items", "sales_orders",
		"document_number_sequences",
		"stocks", "products", "brands", "companies",
	}
	for _, tbl := range tables {
		if err := db.Exec("TRUNCATE TABLE " + tbl + " RESTART IDENTITY CASCADE").Error; err != nil {
			t.Fatalf("failed to truncate %s: %v", tbl, err)
		}
	}
}

type fixture struct {
	Company1ID, Company2ID uint
	Product1ID, Product2ID uint
}

func seedFixture(t *testing.T, db *gorm.DB) fixture {
	t.Helper()
	e1 := model.Company{Code: "T-COMP1", Name: "Test Company 1"}
	e2 := model.Company{Code: "T-COMP2", Name: "Test Company 2"}
	mustCreate(t, db, &e1)
	mustCreate(t, db, &e2)

	brand := model.Brand{Code: "T-BR", Name: "Test Brand"}
	mustCreate(t, db, &brand)

	price := decimal.RequireFromString("100000")
	p1 := model.Product{SKU: "T-SKU-1", Name: "Test Product 1", BrandID: brand.ID, UOM: "PCS", UnitPrice: price}
	p2 := model.Product{SKU: "T-SKU-2", Name: "Test Product 2", BrandID: brand.ID, UOM: "PCS", UnitPrice: price}
	mustCreate(t, db, &p1)
	mustCreate(t, db, &p2)

	qty := decimal.RequireFromString("100")
	for _, eid := range []uint{e1.ID, e2.ID} {
		for _, pid := range []uint{p1.ID, p2.ID} {
			mustCreate(t, db, &model.Stock{CompanyID: eid, ProductID: pid, QuantityOnHand: qty})
		}
	}

	return fixture{Company1ID: e1.ID, Company2ID: e2.ID, Product1ID: p1.ID, Product2ID: p2.ID}
}

func mustCreate(t *testing.T, db *gorm.DB, v interface{}) {
	t.Helper()
	if err := db.Create(v).Error; err != nil {
		t.Fatalf("failed to create fixture row: %v", err)
	}
}

func stockQty(t *testing.T, db *gorm.DB, companyID, productID uint) decimal.Decimal {
	t.Helper()
	var s model.Stock
	if err := db.Where("company_id = ? AND product_id = ?", companyID, productID).First(&s).Error; err != nil {
		t.Fatalf("failed to load stock: %v", err)
	}
	return s.QuantityOnHand
}
