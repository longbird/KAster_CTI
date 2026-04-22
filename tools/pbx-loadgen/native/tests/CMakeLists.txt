if(PBX_LOADGEN_BUILD_CLI)
  add_executable(pbx_loadgen_tests scenario_test.cpp)
  target_link_libraries(pbx_loadgen_tests PRIVATE Catch2::Catch2WithMain loadgen_scenario)
  target_compile_definitions(
    pbx_loadgen_tests
    PRIVATE
      PBX_LOADGEN_EXE_PATH="$<TARGET_FILE:pbx-loadgen>"
      PBX_LOADGEN_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../../../.."
  )

  catch_discover_tests(pbx_loadgen_tests)
endif()

add_executable(pbx_loadgen_tone_generator_tests tone_generator_test.cpp ../src/tone_generator.cpp)
target_link_libraries(pbx_loadgen_tone_generator_tests PRIVATE Catch2::Catch2WithMain)
target_include_directories(pbx_loadgen_tone_generator_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_tone_generator_tests)
