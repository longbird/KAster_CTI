#include <catch2/catch_test_macros.hpp>

#include "loadgen/tone_generator.hpp"

TEST_CASE("tone generator emits beep then silence within one second", "[tone]") {
  loadgen::ToneGenerator tone(8000, 440.0, 120, 0.6);
  const auto frame = tone.nextFrame(8000);

  REQUIRE(frame.size() == 8000);

  const std::vector<int16_t> beepWindow(frame.begin(), frame.begin() + 960);
  const std::vector<int16_t> silentWindow(frame.begin() + 960, frame.end());

  REQUIRE(tone.hasAudibleSample(beepWindow));
  REQUIRE_FALSE(tone.hasAudibleSample(silentWindow));
}
