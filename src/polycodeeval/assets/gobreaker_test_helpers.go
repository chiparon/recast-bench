package gobreaker

import (
	"errors"
	"time"
)

var (
	errFailed   = errors.New("failed")
	errExcluded = errors.New("excluded")
)

type StateChange struct {
	name string
	from State
	to   State
}

func pseudoSleep(cb *CircuitBreaker[bool], period time.Duration) {
	cb.start = cb.start.Add(-period)
	if !cb.expiry.IsZero() {
		cb.expiry = cb.expiry.Add(-period)
	}
}

func succeed(cb *CircuitBreaker[bool]) error {
	_, err := cb.Execute(func() (bool, error) { return true, nil })
	return err
}

func succeedLater(cb *CircuitBreaker[bool], delay time.Duration) <-chan error {
	ch := make(chan error)
	go func() {
		_, err := cb.Execute(func() (bool, error) {
			time.Sleep(delay)
			return true, nil
		})
		ch <- err
	}()
	return ch
}

func fail(cb *CircuitBreaker[bool]) error {
	_, err := cb.Execute(func() (bool, error) { return false, errFailed })
	if errors.Is(err, errFailed) {
		return nil
	}
	return err
}

func exclude(cb *CircuitBreaker[bool]) error {
	_, err := cb.Execute(func() (bool, error) { return false, errExcluded })
	if errors.Is(err, errExcluded) {
		return nil
	}
	return err
}
