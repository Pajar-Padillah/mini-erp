package apperror

import (
	"errors"
	"net/http"
)

var (
	ErrNotFound             = errors.New("resource not found")
	ErrInvalidStatus        = errors.New("document is not in a valid status for this operation")
	ErrValidation           = errors.New("validation failed")
	ErrInsufficientStock    = errors.New("insufficient stock available")
	ErrOverDelivery         = errors.New("quantity exceeds remaining order quantity")
	ErrOverInvoice          = errors.New("quantity exceeds remaining delivered quantity")
	ErrOverpayment          = errors.New("amount exceeds outstanding invoice amount")
	ErrCompanyMismatch      = errors.New("referenced document belongs to a different company")
	ErrHasSubmittedChildren = errors.New("document has submitted downstream documents and cannot be modified")
)

type Business struct {
	Err     error
	Message string
}

func (b *Business) Error() string { return b.Message }
func (b *Business) Unwrap() error { return b.Err }

func Wrap(err error, message string) error {
	return &Business{Err: err, Message: message}
}

func HTTPStatus(err error) int {
	switch {
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrValidation),
		errors.Is(err, ErrInvalidStatus),
		errors.Is(err, ErrInsufficientStock),
		errors.Is(err, ErrOverDelivery),
		errors.Is(err, ErrOverInvoice),
		errors.Is(err, ErrOverpayment),
		errors.Is(err, ErrCompanyMismatch),
		errors.Is(err, ErrHasSubmittedChildren):
		return http.StatusUnprocessableEntity
	default:
		return http.StatusInternalServerError
	}
}
