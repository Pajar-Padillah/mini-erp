package service

import (
	"time"

	"mini-erp/internal/apperror"
)

const dateLayout = "2006-01-02"

func parseDate(s string) (time.Time, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return time.Time{}, apperror.Wrap(apperror.ErrValidation, "invalid date, expected YYYY-MM-DD: "+s)
	}
	return t, nil
}

func nowPtr() *time.Time {
	t := time.Now()
	return &t
}
