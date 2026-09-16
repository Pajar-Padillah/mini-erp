package repository

import (
	"gorm.io/gorm"

	"mini-erp/internal/model"
)

type CompanyRepository struct{ db *gorm.DB }

func NewCompanyRepository(db *gorm.DB) *CompanyRepository { return &CompanyRepository{db} }

func (r *CompanyRepository) List() ([]model.Company, error) {
	var rows []model.Company
	err := r.db.Order("id").Find(&rows).Error
	return rows, err
}

func (r *CompanyRepository) FindByID(id uint) (*model.Company, error) {
	var row model.Company
	if err := r.db.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

type BrandRepository struct{ db *gorm.DB }

func NewBrandRepository(db *gorm.DB) *BrandRepository { return &BrandRepository{db} }

func (r *BrandRepository) List() ([]model.Brand, error) {
	var rows []model.Brand
	err := r.db.Order("id").Find(&rows).Error
	return rows, err
}

type ProductRepository struct{ db *gorm.DB }

func NewProductRepository(db *gorm.DB) *ProductRepository { return &ProductRepository{db} }

func (r *ProductRepository) List() ([]model.Product, error) {
	var rows []model.Product
	err := r.db.Preload("Brand").Order("id").Find(&rows).Error
	return rows, err
}

func (r *ProductRepository) FindByID(db *gorm.DB, id uint) (*model.Product, error) {
	var row model.Product
	if err := db.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}
