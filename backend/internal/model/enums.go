package model

type DocumentStatus string

const (
	DocumentStatusDraft     DocumentStatus = "DRAFT"
	DocumentStatusActive    DocumentStatus = "ACTIVE"
	DocumentStatusProcessed DocumentStatus = "PROCESSED"
	DocumentStatusCompleted DocumentStatus = "COMPLETED"
	DocumentStatusSubmitted DocumentStatus = "SUBMITTED"
)

type PaymentStatus string

const (
	PaymentStatusUnpaid        PaymentStatus = "UNPAID"
	PaymentStatusPartiallyPaid PaymentStatus = "PARTIALLY_PAID"
	PaymentStatusPaid          PaymentStatus = "PAID"
)

type DocType string

const (
	DocTypeSalesOrder    DocType = "SO"
	DocTypeSalesDelivery DocType = "DO"
	DocTypeSalesInvoice  DocType = "INV"
	DocTypeSalesPayment  DocType = "PAY"
)
