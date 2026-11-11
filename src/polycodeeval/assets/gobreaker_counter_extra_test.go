package gobreaker

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCountsConsecutiveReset(t *testing.T) {
	c := Counts{}
	c.onSuccess()
	c.onSuccess()
	assert.Equal(t, uint32(2), c.ConsecutiveSuccesses)
	assert.Equal(t, uint32(0), c.ConsecutiveFailures)

	c.onFailure()
	assert.Equal(t, uint32(0), c.ConsecutiveSuccesses)
	assert.Equal(t, uint32(1), c.ConsecutiveFailures)

	c.onSuccess()
	assert.Equal(t, uint32(1), c.ConsecutiveSuccesses)
	assert.Equal(t, uint32(0), c.ConsecutiveFailures)
}

func TestCountsExclusionHandling(t *testing.T) {
	c := Counts{}
	c.onSuccess()
	c.onExclusion()
	assert.Equal(t, uint32(1), c.TotalSuccesses)
	assert.Equal(t, uint32(1), c.TotalExclusions)
	assert.Equal(t, uint32(1), c.ConsecutiveSuccesses)
	assert.Equal(t, uint32(0), c.ConsecutiveFailures)
}

func TestCountsClearAllFields(t *testing.T) {
	c := Counts{
		Requests:             10,
		TotalSuccesses:       5,
		TotalFailures:        3,
		TotalExclusions:      2,
		ConsecutiveSuccesses: 2,
		ConsecutiveFailures:  1,
	}
	c.clear()
	assert.Equal(t, Counts{}, c)
}

func TestRollingCountsMultiBucketShift(t *testing.T) {
	rc := newRollingCounts(3)
	rc.onRequest()
	rc.onSuccess(rc.current())
	assert.Equal(t, uint32(1), rc.Counts.Requests)
	assert.Equal(t, uint32(1), rc.Counts.TotalSuccesses)

	rc.roll()
	rc.onRequest()
	rc.onFailure(rc.current())
	assert.Equal(t, uint32(2), rc.Counts.Requests)
	assert.Equal(t, uint32(1), rc.Counts.TotalFailures)

	rc.roll()
	rc.onRequest()
	rc.onSuccess(rc.current())
	assert.Equal(t, uint32(3), rc.Counts.Requests)

	// Rolling a 4th time shifts out the 1st bucket (which had 1 success)
	rc.roll()
	assert.Equal(t, uint32(2), rc.Counts.Requests)
	assert.Equal(t, uint32(1), rc.Counts.TotalSuccesses)
}

func TestRollingCountsWrapAroundAge(t *testing.T) {
	rc := newRollingCounts(4)
	for i := 0; i < 10; i++ {
		rc.roll()
	}
	assert.Equal(t, uint64(10), rc.age)
	assert.Equal(t, uint64(2), rc.current())
}

func TestRollingCountsClearAllBuckets(t *testing.T) {
	rc := newRollingCounts(3)
	rc.onRequest()
	rc.onSuccess(rc.current())
	rc.roll()
	rc.onRequest()
	rc.onFailure(rc.current())
	rc.clear()

	assert.Equal(t, Counts{}, rc.Counts)
	for _, b := range rc.buckets {
		assert.Equal(t, Counts{}, b)
	}
}

func TestRollingCountsBucketAtCalculation(t *testing.T) {
	rc := newRollingCounts(3)
	rc.onRequest()
	rc.onSuccess(rc.current())
	// at offset 0 (current bucket)
	assert.Equal(t, uint32(1), rc.bucketAt(0).Requests)
	assert.Equal(t, uint32(1), rc.bucketAt(0).TotalSuccesses)

	// roll to next bucket
	rc.roll()
	assert.Equal(t, uint32(0), rc.bucketAt(0).Requests)
	// bucketAt with offset relative to current
	assert.Equal(t, uint32(1), rc.bucketAt(2).Requests)
}

func TestRollingCountsGrowFastForward(t *testing.T) {
	rc := newRollingCounts(5)
	rc.onRequest()
	rc.onSuccess(rc.current())
	assert.Equal(t, uint64(0), rc.age)

	// grow by 2 ages (smaller than bucket len 5)
	rc.grow(2)
	assert.Equal(t, uint64(2), rc.age)
	assert.Equal(t, uint32(1), rc.Counts.Requests)

	// grow past bucket length resets
	rc.grow(10)
	assert.Equal(t, uint64(10), rc.age)
	assert.Equal(t, Counts{}, rc.Counts)
}
