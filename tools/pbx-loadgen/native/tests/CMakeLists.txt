add_executable(pbx_loadgen_tests scenario_test.cpp)
target_link_libraries(pbx_loadgen_tests PRIVATE Catch2::Catch2WithMain loadgen_scenario)
target_compile_definitions(
  pbx_loadgen_tests
  PRIVATE
    PBX_LOADGEN_EXE_PATH="$<TARGET_FILE:pbx-loadgen>"
    PBX_LOADGEN_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../../../.."
)

include("${catch2_SOURCE_DIR}/extras/Catch.cmake")
catch_discover_tests(pbx_loadgen_tests)
