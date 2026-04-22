#pragma once

#include <cstdint>
#include <vector>

namespace loadgen {

class ToneGenerator {
 public:
  ToneGenerator(int sampleRate, double frequencyHz, int beepDurationMs, double gain);

  std::vector<int16_t> nextFrame(int samplesPerFrame);
  bool hasAudibleSample(const std::vector<int16_t>& frame) const;

 private:
 int sampleRate_;
  double frequencyHz_;
  int beepDurationMs_;
  double gain_;
  std::uint64_t sampleCursor_{0};
};

}  // namespace loadgen
