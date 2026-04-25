cmake_minimum_required(VERSION 3.20)
project(pbx_loadgen VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(CTest)
option(PBX_LOADGEN_BUILD_CLI "Build the pbx-loadgen CLI target" ON)

include(FetchContent)
FetchContent_Declare(CLI11 GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git GIT_TAG 6c7b07a878ad834957b98d0f9ce1dbe0cb204fc9)
FetchContent_Declare(yaml-cpp GIT_REPOSITORY https://github.com/jbeder/yaml-cpp.git GIT_TAG f7320141120f720aecc4c32be25586e7da9eb978)
FetchContent_Declare(nlohmann_json GIT_REPOSITORY https://github.com/nlohmann/json.git GIT_TAG 9cca280a4d0ccf0c08f47a99aa71d1b0e52f8d03)
if(BUILD_TESTING)
  FetchContent_Declare(Catch2 GIT_REPOSITORY https://github.com/catchorg/Catch2.git GIT_TAG 9827c148c397289df17d3967692619a198032a24)
endif()
FetchContent_MakeAvailable(CLI11 yaml-cpp nlohmann_json)
if(BUILD_TESTING)
  FetchContent_MakeAvailable(Catch2)
endif()

add_library(loadgen_scenario STATIC src/scenario.cpp)
target_link_libraries(loadgen_scenario PUBLIC yaml-cpp)
target_include_directories(loadgen_scenario PUBLIC include)

add_library(loadgen_test_plan STATIC src/test_plan.cpp)
target_link_libraries(loadgen_test_plan PUBLIC yaml-cpp)
target_include_directories(loadgen_test_plan PUBLIC include)

add_library(loadgen_orchestrator STATIC src/orchestrator.cpp)
target_include_directories(loadgen_orchestrator PUBLIC include)

add_library(loadgen_report_writer STATIC src/report_writer.cpp)
target_link_libraries(loadgen_report_writer PUBLIC nlohmann_json::nlohmann_json)
target_include_directories(loadgen_report_writer PUBLIC include)

add_library(loadgen_test_result STATIC src/test_result.cpp)
target_link_libraries(loadgen_test_result PUBLIC nlohmann_json::nlohmann_json)
target_include_directories(loadgen_test_result PUBLIC include)

add_library(loadgen_feature_inventory STATIC src/feature_inventory.cpp)
target_link_libraries(loadgen_feature_inventory PUBLIC nlohmann_json::nlohmann_json)
target_include_directories(loadgen_feature_inventory PUBLIC include)

add_library(loadgen_command_logic STATIC src/command_logic.cpp)
target_link_libraries(
  loadgen_command_logic
  PUBLIC
    loadgen_orchestrator
    loadgen_report_writer
    loadgen_scenario
)
target_include_directories(loadgen_command_logic PUBLIC include)

if(PBX_LOADGEN_BUILD_CLI)
  find_package(PJSIP REQUIRED)

  add_executable(pbx-loadgen src/main.cpp)
  target_sources(pbx-loadgen PRIVATE src/pjsip_client.cpp src/tone_generator.cpp)
  target_link_libraries(
    pbx-loadgen
    PRIVATE
      CLI11::CLI11
      loadgen_command_logic
      nlohmann_json::nlohmann_json
      PJSIP::PJSIP
  )
  target_include_directories(pbx-loadgen PRIVATE include)
endif()

if(BUILD_TESTING)
  enable_testing()
  include("${catch2_SOURCE_DIR}/extras/Catch.cmake")
  add_subdirectory(tests)

  add_executable(pbx_loadgen_call_types_tests tests/call_types_test.cpp)
  target_link_libraries(pbx_loadgen_call_types_tests PRIVATE Catch2::Catch2WithMain)
  target_include_directories(pbx_loadgen_call_types_tests PRIVATE include)
  catch_discover_tests(pbx_loadgen_call_types_tests)
endif()
