cmake_minimum_required(VERSION 3.20)
project(pbx_loadgen VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(CTest)

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

add_executable(pbx-loadgen src/main.cpp)
target_link_libraries(
  pbx-loadgen
  PRIVATE
    CLI11::CLI11
    loadgen_scenario
    nlohmann_json::nlohmann_json
)
target_include_directories(pbx-loadgen PRIVATE include)

if(BUILD_TESTING)
  enable_testing()
  add_subdirectory(tests)
endif()
