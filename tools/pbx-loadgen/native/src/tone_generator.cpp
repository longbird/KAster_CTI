#include "loadgen/tone_generator.hpp"

#include <algorithm>
#include <cmath>

namespace loadgen {

ToneGenerator::ToneGenerator(int sampleRate,
                             double frequencyHz,
                             int beepDurationMs,
                             int beepIntervalMs,
                             double gain)
    : sampleRate_(sampleRate),
      frequencyHz_(frequencyHz),
      beepDurationMs_(beepDurationMs),
      beepIntervalMs_(beepIntervalMs),
      gain_(gain) {}

std::vector<int16_t> ToneGenerator::nextFrame(int samplesPerFrame) {
  std::vector<int16_t> frame;
  frame.reserve(samplesPerFrame);

  const std::uint64_t samplesPerSecond = static_cast<std::uint64_t>(sampleRate_);
  const std::uint64_t activeSamples =
      (samplesPerSecond * static_cast<std::uint64_t>(beepDurationMs_)) / 1000;
  const std::uint64_t cycleSamples = std::max<std::uint64_t>(
      1, (samplesPerSecond * static_cast<std::uint64_t>(beepIntervalMs_)) / 1000);
  const std::uint64_t audibleSamples =
      std::min(activeSamples, cycleSamples);

  for (int i = 0; i < samplesPerFrame; ++i, ++sampleCursor_) {
    if ((sampleCursor_ % cycleSamples) < audibleSamples) {
      const double radians =
          2.0 * 3.141592653589793 * frequencyHz_ *
          static_cast<double>(sampleCursor_) /
          static_cast<double>(sampleRate_);
      frame.push_back(
          static_cast<int16_t>(std::sin(radians) * 32767.0 * gain_));
    } else {
      frame.push_back(0);
    }
  }

  return frame;
}

bool ToneGenerator::hasAudibleSample(const std::vector<int16_t>& frame) const {
  for (const auto sample : frame) {
    if (sample != 0) {
      return true;
    }
  }
  return false;
}

}  // namespace loadgen
