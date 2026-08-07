package config

import "testing"

func TestParseBytes(t *testing.T) {
	tests := map[string]uint64{
		"8GiB":  8 << 30,
		"32GB":  32_000_000_000,
		"4096":  4096,
		"2 MiB": 2 << 20,
	}
	for input, want := range tests {
		got, err := ParseBytes(input)
		if err != nil {
			t.Fatalf("ParseBytes(%q): %v", input, err)
		}
		if got != want {
			t.Fatalf("ParseBytes(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestParseBytesRejectsInvalid(t *testing.T) {
	for _, input := range []string{"", "0", "1.5GiB", "nope"} {
		if _, err := ParseBytes(input); err == nil {
			t.Fatalf("ParseBytes(%q) unexpectedly succeeded", input)
		}
	}
}
