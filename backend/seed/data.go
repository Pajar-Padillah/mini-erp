package seed

import (
	"log"
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"mini-erp/internal/model"
	"mini-erp/internal/repository"
)

func Run(db *gorm.DB) error {
	companies, err := seedCompanies(db)
	if err != nil {
		return err
	}
	brands, err := seedBrands(db)
	if err != nil {
		return err
	}
	products, err := seedProducts(db, brands)
	if err != nil {
		return err
	}
	if err := seedStocks(db, companies, products); err != nil {
		return err
	}
	if err := seedSampleOrders(db, companies, products); err != nil {
		return err
	}
	log.Println("seed complete")
	return nil
}

// seedCompanies creates the Sant Group holding and its branches.
func seedCompanies(db *gorm.DB) ([]model.Company, error) {
	group := model.Company{Code: "SGI", Name: "PT Sant Group Indonesia"}
	if err := db.Where("code = ?", group.Code).FirstOrCreate(&group, group).Error; err != nil {
		return nil, err
	}
	out := []model.Company{group}

	branches := []model.Company{
		{Code: "CRS", Name: "CRUSITA"},
		{Code: "AOR", Name: "AOERA"},
		{Code: "YRS", Name: "YORS"},
		{Code: "KYF", Name: "KYFEE"},
	}
	for _, d := range branches {
		var row model.Company
		// Match on code only, so renaming a branch updates it instead of inserting a duplicate.
		if err := db.Where("code = ?", d.Code).Attrs(d).FirstOrCreate(&row).Error; err != nil {
			return nil, err
		}
		if row.ParentID == nil || *row.ParentID != group.ID || row.Name != d.Name {
			if err := db.Model(&row).Updates(map[string]any{"parent_id": group.ID, "name": d.Name}).Error; err != nil {
				return nil, err
			}
		}
		out = append(out, row)
	}
	return out, nil
}

func seedBrands(db *gorm.DB) ([]model.Brand, error) {
	defs := []model.Brand{
		{Code: "BR-CRUSITA", Name: "Crusita"},
		{Code: "BR-AOERA", Name: "Aoera"},
		{Code: "BR-YORS", Name: "Yors Studio"},
	}
	var out []model.Brand
	for _, d := range defs {
		var row model.Brand
		if err := db.Where("code = ?", d.Code).FirstOrCreate(&row, d).Error; err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, nil
}

func seedProducts(db *gorm.DB, brands []model.Brand) ([]model.Product, error) {
	price := func(v string) decimal.Decimal { d, _ := decimal.NewFromString(v); return d }

	var crusita, aoera, yors model.Brand
	for _, b := range brands {
		switch b.Code {
		case "BR-CRUSITA":
			crusita = b
		case "BR-AOERA":
			aoera = b
		case "BR-YORS":
			yors = b
		}
	}

	defs := []model.Product{
		{SKU: "CRU-001", Name: "Crusita Noir Eau de Parfum 50ml", BrandID: crusita.ID, UOM: "PCS", UnitPrice: price("285000")},
		{SKU: "CRU-002", Name: "Crusita Blanc Eau de Parfum 50ml", BrandID: crusita.ID, UOM: "PCS", UnitPrice: price("285000")},
		{SKU: "CRU-003", Name: "Crusita Velvet Rose Eau de Parfum 30ml", BrandID: crusita.ID, UOM: "PCS", UnitPrice: price("195000")},
		{SKU: "CRU-004", Name: "Crusita Royal Oud Eau de Parfum 50ml", BrandID: crusita.ID, UOM: "PCS", UnitPrice: price("320000")},
		{SKU: "CRU-005", Name: "Crusita Citrus Bloom Eau de Parfum 30ml", BrandID: crusita.ID, UOM: "PCS", UnitPrice: price("195000")},
		{SKU: "CRU-006", Name: "Crusita Midnight Musk Body Mist 100ml", BrandID: crusita.ID, UOM: "PCS", UnitPrice: price("89000")},

		{SKU: "AOR-001", Name: "Aoera Gentle Facial Wash 100ml", BrandID: aoera.ID, UOM: "PCS", UnitPrice: price("39000")},
		{SKU: "AOR-002", Name: "Aoera Hydrating Toner 150ml", BrandID: aoera.ID, UOM: "PCS", UnitPrice: price("49000")},
		{SKU: "AOR-003", Name: "Aoera Hand & Body Lotion 200ml", BrandID: aoera.ID, UOM: "PCS", UnitPrice: price("45000")},
		{SKU: "AOR-004", Name: "Aoera Deo Spray Fresh 100ml", BrandID: aoera.ID, UOM: "PCS", UnitPrice: price("32000")},
		{SKU: "AOR-005", Name: "Aoera Hair & Body Mist 100ml", BrandID: aoera.ID, UOM: "PCS", UnitPrice: price("55000")},
		{SKU: "AOR-006", Name: "Aoera Hand Sanitizer Gel 60ml", BrandID: aoera.ID, UOM: "PCS", UnitPrice: price("18000")},

		{SKU: "YRS-001", Name: "Yors Studio Eclipse Eau de Parfum 50ml", BrandID: yors.ID, UOM: "PCS", UnitPrice: price("275000")},
		{SKU: "YRS-002", Name: "Yors Studio Wanderlust Eau de Parfum 50ml", BrandID: yors.ID, UOM: "PCS", UnitPrice: price("275000")},
		{SKU: "YRS-003", Name: "Yors Studio Neon Dreams Eau de Parfum 30ml", BrandID: yors.ID, UOM: "PCS", UnitPrice: price("185000")},
		{SKU: "YRS-004", Name: "Yors Studio Amber Tale Eau de Parfum 50ml", BrandID: yors.ID, UOM: "PCS", UnitPrice: price("299000")},
		{SKU: "YRS-005", Name: "Yors Studio Dusk Whisper Body Mist 100ml", BrandID: yors.ID, UOM: "PCS", UnitPrice: price("85000")},
	}
	var out []model.Product
	for _, d := range defs {
		var row model.Product
		if err := db.Where("sku = ?", d.SKU).FirstOrCreate(&row, d).Error; err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, nil
}

func seedStocks(db *gorm.DB, companies []model.Company, products []model.Product) error {
	qty := func(v string) decimal.Decimal { d, _ := decimal.NewFromString(v); return d }
	for _, e := range companies {
		for _, p := range products {
			var row model.Stock
			err := db.Where("company_id = ? AND product_id = ?", e.ID, p.ID).First(&row).Error
			if err == gorm.ErrRecordNotFound {
				row = model.Stock{CompanyID: e.ID, ProductID: p.ID, QuantityOnHand: qty("500")}
				if err := db.Create(&row).Error; err != nil {
					return err
				}
			} else if err != nil {
				return err
			}
		}
	}
	return nil
}

func seedSampleOrders(db *gorm.DB, companies []model.Company, products []model.Product) error {
	var count int64
	if err := db.Model(&model.SalesOrder{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	byCode := make(map[string]model.Product, len(products))
	for _, p := range products {
		byCode[p.SKU] = p
	}
	byCompany := make(map[string]model.Company, len(companies))
	for _, c := range companies {
		byCompany[c.Code] = c
	}

	numbering := repository.NewDocumentNumberRepository(db)
	qty := func(v string) decimal.Decimal { d, _ := decimal.NewFromString(v); return d }

	type lineDef struct {
		sku string
		qty string
	}
	type orderDef struct {
		company      model.Company
		customerName string
		notes        string
		lines        []lineDef
	}

	defs := []orderDef{
		{
			company:      byCompany["SGI"],
			customerName: "PT Cantik Distribusi Nusantara",
			notes:        "Seed sample order -- modern-trade distributor restock, ready for reviewer to partially deliver, invoice, and pay.",
			lines: []lineDef{
				{"CRU-001", "20"},
				{"AOR-001", "50"},
				{"YRS-001", "15"},
			},
		},
		{
			company:      byCompany["CRS"],
			customerName: "Toko Kosmetik Sukses Mandiri",
			notes:        "Seed sample order -- offline retail store order.",
			lines: []lineDef{
				{"AOR-003", "30"},
				{"AOR-005", "20"},
			},
		},
		{
			company:      byCompany["AOR"],
			customerName: "PT Mitra Retail Nusantara",
			notes:        "Seed sample order -- branch order for a national retail chain.",
			lines: []lineDef{
				{"CRU-004", "100"},
				{"YRS-004", "80"},
			},
		},
		{
			company:      byCompany["YRS"],
			customerName: "PT Griya Kemasan Cantik",
			notes:        "Seed sample order -- bulk wholesale branch order.",
			lines: []lineDef{
				{"AOR-004", "200"},
			},
		},
	}

	for i, d := range defs {
		orderNo, err := numbering.Next(db, d.company.ID, model.DocTypeSalesOrder, d.company.Code)
		if err != nil {
			return err
		}
		orderDate := time.Now().Truncate(24*time.Hour).AddDate(0, 0, -len(defs)+i)
		submittedAt := orderDate

		so := model.SalesOrder{
			CompanyID:      d.company.ID,
			OrderNo:        orderNo,
			CustomerName:   d.customerName,
			OrderDate:      orderDate,
			DocumentStatus: model.DocumentStatusActive,
			SubmittedAt:    &submittedAt,
			Notes:          d.notes,
		}

		items := make([]model.SalesOrderItem, 0, len(d.lines))
		total := decimal.Zero
		for lineNo, ln := range d.lines {
			p := byCode[ln.sku]
			q := qty(ln.qty)
			items = append(items, model.SalesOrderItem{
				LineNo:     lineNo + 1,
				ProductID:  p.ID,
				QtyOrdered: q,
				UnitPrice:  p.UnitPrice,
			})
			total = total.Add(q.Mul(p.UnitPrice))
		}
		so.TotalAmount = total

		if err := db.Create(&so).Error; err != nil {
			return err
		}
		for i := range items {
			items[i].SalesOrderID = so.ID
		}
		if err := db.Create(&items).Error; err != nil {
			return err
		}
	}
	return nil
}
