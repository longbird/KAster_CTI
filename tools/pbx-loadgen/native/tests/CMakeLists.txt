add_executable(pbx_loadgen_tests scenario_test.cpp)
target_link_libraries(pbx_loadgen_tests PRIVATE Catch2::Catch2WithMain loadgen_scenario)
target_compile_definitions(
  pbx_loadgen_tests
  PRIVATE
    PBX_LOADGEN_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../../../.."
)
if(PBX_LOADGEN_BUILD_CLI)
  target_compile_definitions(
    pbx_loadgen_tests
    PRIVATE
      PBX_LOADGEN_HAS_CLI=1
      PBX_LOADGEN_EXE_PATH="$<TARGET_FILE:pbx-loadgen>"
  )
endif()

catch_discover_tests(pbx_loadgen_tests)

add_executable(pbx_loadgen_test_plan_tests test_plan_test.cpp)
target_link_libraries(
  pbx_loadgen_test_plan_tests
  PRIVATE
    Catch2::Catch2WithMain
    loadgen_test_plan
)
target_include_directories(pbx_loadgen_test_plan_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_test_plan_tests)

add_executable(pbx_loadgen_feature_inventory_tests feature_inventory_test.cpp)
target_link_libraries(
  pbx_loadgen_feature_inventory_tests
  PRIVATE
    Catch2::Catch2WithMain
    loadgen_feature_inventory
)
target_include_directories(pbx_loadgen_feature_inventory_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_feature_inventory_tests)

add_executable(pbx_loadgen_tone_generator_tests tone_generator_test.cpp ../src/tone_generator.cpp)
target_link_libraries(pbx_loadgen_tone_generator_tests PRIVATE Catch2::Catch2WithMain)
target_include_directories(pbx_loadgen_tone_generator_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_tone_generator_tests)

add_executable(pbx_loadgen_orchestrator_tests orchestrator_test.cpp)
target_link_libraries(pbx_loadgen_orchestrator_tests PRIVATE Catch2::Catch2WithMain loadgen_orchestrator)
target_include_directories(pbx_loadgen_orchestrator_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_orchestrator_tests)

add_executable(pbx_loadgen_report_writer_tests report_writer_test.cpp)
target_link_libraries(pbx_loadgen_report_writer_tests PRIVATE Catch2::Catch2WithMain loadgen_report_writer)
target_include_directories(pbx_loadgen_report_writer_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_report_writer_tests)

add_executable(pbx_loadgen_command_logic_tests command_logic_test.cpp)
target_link_libraries(
  pbx_loadgen_command_logic_tests
  PRIVATE
    Catch2::Catch2WithMain
    loadgen_command_logic
)
target_include_directories(pbx_loadgen_command_logic_tests PRIVATE ../include)

catch_discover_tests(pbx_loadgen_command_logic_tests)
