package gobreaker

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestTwoStepBasicAllow(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[string](Settings{Name: "test-twostep"})
	assert.Equal(t, "test-twostep", cb.Name())
	assert.Equal(t, StateClosed, cb.State())

	done, err := cb.Allow()
	assert.Nil(t, err)
	assert.NotNil(t, done)
	done(nil)

	assert.Equal(t, uint32(1), cb.Counts().Requests)
	assert.Equal(t, uint32(1), cb.Counts().TotalSuccesses)
}

func TestTwoStepAllowSuccessState(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[int](Settings{})
	done, err := cb.Allow()
	assert.Nil(t, err)
	done(nil)

	assert.Equal(t, StateClosed, cb.State())
	counts := cb.Counts()
	assert.Equal(t, uint32(1), counts.TotalSuccesses)
	assert.Equal(t, uint32(1), counts.ConsecutiveSuccesses)
}

func TestTwoStepAllowFailureState(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[int](Settings{})
	done, err := cb.Allow()
	assert.Nil(t, err)
	done(errors.New("request error"))

	counts := cb.Counts()
	assert.Equal(t, uint32(1), counts.TotalFailures)
	assert.Equal(t, uint32(1), counts.ConsecutiveFailures)
}

func TestTwoStepAllowExcludedCallback(t *testing.T) {
	var errSkip = errors.New("skip")
	cb := NewTwoStepCircuitBreaker[int](Settings{
		IsExcluded: func(err error) bool { return errors.Is(err, errSkip) },
	})
	done, err := cb.Allow()
	assert.Nil(t, err)
	done(errSkip)

	counts := cb.Counts()
	assert.Equal(t, uint32(1), counts.TotalExclusions)
	assert.Equal(t, uint32(0), counts.TotalFailures)
}

func TestTwoStepOpenRejection(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[int](Settings{
		ReadyToTrip: func(c Counts) bool { return c.ConsecutiveFailures >= 2 },
	})

	for i := 0; i < 2; i++ {
		done, err := cb.Allow()
		assert.Nil(t, err)
		done(errors.New("fail"))
	}

	assert.Equal(t, StateOpen, cb.State())
	done, err := cb.Allow()
	assert.Error(t, err)
	assert.Nil(t, done)
}

func TestTwoStepHalfOpenRecoveryToClosed(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[int](Settings{
		Timeout:     50 * time.Millisecond,
		MaxRequests: 1,
		ReadyToTrip: func(c Counts) bool { return c.ConsecutiveFailures >= 1 },
	})

	done, err := cb.Allow()
	assert.Nil(t, err)
	done(errors.New("fail"))
	assert.Equal(t, StateOpen, cb.State())

	time.Sleep(60 * time.Millisecond)

	done, err = cb.Allow()
	assert.Nil(t, err)
	done(nil)
	assert.Equal(t, StateClosed, cb.State())
}

func TestTwoStepHalfOpenFailureReopens(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[int](Settings{
		Timeout:     50 * time.Millisecond,
		MaxRequests: 1,
		ReadyToTrip: func(c Counts) bool { return c.ConsecutiveFailures >= 1 },
	})

	done, err := cb.Allow()
	assert.Nil(t, err)
	done(errors.New("fail"))
	assert.Equal(t, StateOpen, cb.State())

	time.Sleep(60 * time.Millisecond)

	done, err = cb.Allow()
	assert.Nil(t, err)
	done(errors.New("fail again"))
	assert.Equal(t, StateOpen, cb.State())
}

func TestTwoStepNameAndCountsMatch(t *testing.T) {
	cb := NewTwoStepCircuitBreaker[string](Settings{Name: "my-breaker"})
	assert.Equal(t, "my-breaker", cb.Name())
	assert.Equal(t, Counts{}, cb.Counts())
}
