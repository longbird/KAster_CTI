cmake_minimum_required(VERSION 3.24)
project(pbx_loadgen VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(CTest)

include(FetchContent)
FetchContent_Declare(CLI11 GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git GIT_TAG v2.4.2)
FetchContent_Declare(yaml-cpp GIT_REPOSITORY https://github.com/jbeder/yaml-cpp.git GIT_TAG 0.8.0)
FetchContent_Declare(nlohmann_json GIT_REPOSITORY https://github.com/nlohmann/json.git GIT_TAG v3.11.3)
if(BUILD_TESTING)
  FetchContent_Declare(Catch2 GIT_REPOSITORY https://github.com/catchorg/Catch2.git GIT_TAG v3.7.1)
endif()
FetchContent_MakeAvailable(CLI11 yaml-cpp nlohmann_json)
if(BUILD_TESTING)
  FetchContent_MakeAvailable(Catch2)
endif()

add_executable(pbx-loadgen src/main.cpp)
target_link_libraries(pbx-loadgen PRIVATE CLI11::CLI11 yaml-cpp nlohmann_json::nlohmann_json)
target_include_directories(pbx-loadgen PRIVATE include)

if(BUILD_TESTING)
  enable_testing()
  add_subdirectory(tests)
endif()
