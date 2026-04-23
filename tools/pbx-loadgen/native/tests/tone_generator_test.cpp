#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <cstdlib>

#include "loadgen/tone_generator.hpp"

namespace {

int maxAbsSample(const std::vector<int16_t>& frame) {
  int maxAbs = 0;
  for (const auto sample : frame) {
    maxAbs = std::max(maxAbs, std::abs(static_cast<int>(sample)));
  }
  return maxAbs;
}

}  // namespace

TEST_CASE("tone generator repeats on the configured interval", "[tone]") {
  loadgen::ToneGenerator tone(8000, 440.0, 120, 800, 0.6);
  const auto frame = tone.nextFrame(8000);

  REQUIRE(frame.size() == 8000);

  const std::vector<int16_t> firstBeep(frame.begin(), frame.begin() + 960);
  const std::vector<int16_t> firstSilence(frame.begin() + 960, frame.begin() + 6400);
  const std::vector<int16_t> secondBeep(frame.begin() + 6400, frame.begin() + 7360);
  const std::vector<int16_t> tailSilence(frame.begin() + 7360, frame.end());

  REQUIRE(tone.hasAudibleSample(firstBeep));
  REQUIRE_FALSE(tone.hasAudibleSample(firstSilence));
  REQUIRE(tone.hasAudibleSample(secondBeep));
  REQUIRE_FALSE(tone.hasAudibleSample(tailSilence));
}

TEST_CASE("tone generator scales amplitude with gain", "[tone]") {
  loadgen::ToneGenerator lowGainTone(8000, 440.0, 120, 800, 0.25);
  loadgen::ToneGenerator highGainTone(8000, 440.0, 120, 800, 0.75);

  const auto lowGainFrame = lowGainTone.nextFrame(160);
  const auto highGainFrame = highGainTone.nextFrame(160);

  REQUIRE(maxAbsSample(lowGainFrame) > 0);
  REQUIRE(maxAbsSample(highGainFrame) > maxAbsSample(lowGainFrame));
}
