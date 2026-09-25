package paginate

import "testing"

func TestClampLimit(t *testing.T) {
	for in, want := range map[int]int{
		-5: DefaultLimit, 0: DefaultLimit, 1: 1, 30: 30,
		MaxLimit: MaxLimit, MaxLimit + 1: MaxLimit, 5000: MaxLimit,
	} {
		if got := ClampLimit(in); got != want {
			t.Errorf("ClampLimit(%d) = %d, want %d", in, got, want)
		}
		if got := (Query{Limit: in}).Clamp(); got != want {
			t.Errorf("Query{Limit: %d}.Clamp() = %d, want %d", in, got, want)
		}
	}
}
