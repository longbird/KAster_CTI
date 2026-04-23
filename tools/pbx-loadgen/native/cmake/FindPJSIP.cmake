if(NOT DEFINED PJSIP_ROOT)
  set(PJSIP_ROOT "$ENV{PJSIP_ROOT}")
endif()

include(FindPackageHandleStandardArgs)

set(_PJSIP_NOT_FOUND_MESSAGE "")
unset(PJSIP_INCLUDE_DIR)
unset(PJSIP_LIBRARIES)
unset(PJSIP_PJSUA_LIB_LIBRARY)

function(_pjsip_resolve_library out_var lib_name)
  unset(${out_var} PARENT_SCOPE)

  string(TOUPPER "${lib_name}" _pjsip_lib_var_name)
  string(REPLACE "-" "_" _pjsip_lib_var_name "${_pjsip_lib_var_name}")
  set(_pjsip_cache_var "PJSIP_${_pjsip_lib_var_name}_LIBRARY")

  unset(${_pjsip_cache_var} CACHE)
  find_library(
    ${_pjsip_cache_var}
    NAMES "${lib_name}"
    HINTS ${_PJSIP_LIBRARY_DIR_HINTS}
    NO_DEFAULT_PATH
  )
  if(${_pjsip_cache_var})
    set(${out_var} "${${_pjsip_cache_var}}" PARENT_SCOPE)
    set(${_pjsip_cache_var} "${${_pjsip_cache_var}}" PARENT_SCOPE)
    return()
  endif()

  unset(_pjsip_pattern_matches)
  foreach(_pjsip_dir IN LISTS _PJSIP_LIBRARY_DIR_HINTS)
    if(NOT IS_DIRECTORY "${_pjsip_dir}")
      continue()
    endif()
    foreach(_pjsip_suffix IN LISTS CMAKE_FIND_LIBRARY_SUFFIXES)
      file(
        GLOB _pjsip_dir_matches
        LIST_DIRECTORIES false
        "${_pjsip_dir}/*${lib_name}*${_pjsip_suffix}"
      )
      list(APPEND _pjsip_pattern_matches ${_pjsip_dir_matches})
    endforeach()
  endforeach()
  list(REMOVE_DUPLICATES _pjsip_pattern_matches)
  list(SORT _pjsip_pattern_matches)
  list(LENGTH _pjsip_pattern_matches _pjsip_pattern_match_count)
  if(_pjsip_pattern_match_count GREATER 0)
    unset(_pjsip_preferred_match)
    unset(_pjsip_preferred_match_name)
    foreach(_pjsip_pattern_match IN LISTS _pjsip_pattern_matches)
      string(TOLOWER "${_pjsip_pattern_match}" _pjsip_pattern_match_lower)
      if(_pjsip_pattern_match_lower MATCHES "debug")
        continue()
      endif()
      get_filename_component(_pjsip_pattern_match_name "${_pjsip_pattern_match}" NAME)
      if(NOT _pjsip_preferred_match)
        set(_pjsip_preferred_match "${_pjsip_pattern_match}")
        set(_pjsip_preferred_match_name "${_pjsip_pattern_match_name}")
        continue()
      endif()
      string(LENGTH "${_pjsip_pattern_match_name}" _pjsip_pattern_match_name_length)
      string(LENGTH "${_pjsip_preferred_match_name}" _pjsip_preferred_match_name_length)
      if(_pjsip_pattern_match_name_length LESS _pjsip_preferred_match_name_length)
        set(_pjsip_preferred_match "${_pjsip_pattern_match}")
        set(_pjsip_preferred_match_name "${_pjsip_pattern_match_name}")
      endif()
    endforeach()
    if(NOT _pjsip_preferred_match)
      list(GET _pjsip_pattern_matches 0 _pjsip_preferred_match)
    endif()
    set(${out_var} "${_pjsip_preferred_match}" PARENT_SCOPE)
    set(${_pjsip_cache_var} "${_pjsip_preferred_match}" PARENT_SCOPE)
  endif()
endfunction()

if(NOT PJSIP_ROOT)
  set(_PJSIP_NOT_FOUND_MESSAGE "Set PJSIP_ROOT to a pjproject installation root.")
else()
  file(TO_CMAKE_PATH "${PJSIP_ROOT}" PJSIP_ROOT)

  file(
    GLOB_RECURSE PJSIP_HEADER_CANDIDATES
    LIST_DIRECTORIES false
    "${PJSIP_ROOT}/**/pjsua.h"
  )
  list(LENGTH PJSIP_HEADER_CANDIDATES _pjsip_header_count)
  if(_pjsip_header_count GREATER 0)
    list(GET PJSIP_HEADER_CANDIDATES 0 PJSIP_HEADER_FILE)
    get_filename_component(_PJSIP_HEADER_DIR "${PJSIP_HEADER_FILE}" DIRECTORY)
    get_filename_component(_PJSIP_HEADER_DIR_NAME "${_PJSIP_HEADER_DIR}" NAME)
    if(_PJSIP_HEADER_DIR_NAME STREQUAL "pjsua-lib")
      get_filename_component(PJSIP_INCLUDE_DIR "${_PJSIP_HEADER_DIR}" DIRECTORY)
    else()
      set(PJSIP_INCLUDE_DIR "${_PJSIP_HEADER_DIR}")
    endif()
  else()
    set(_PJSIP_NOT_FOUND_MESSAGE
        "Could not find pjsua.h under PJSIP_ROOT='${PJSIP_ROOT}'.")
  endif()

  set(_PJSIP_LIBRARY_DIR_HINTS
      "${PJSIP_ROOT}"
      "${PJSIP_ROOT}/lib"
      "${PJSIP_ROOT}/lib64"
      "${PJSIP_ROOT}/pjlib/lib"
      "${PJSIP_ROOT}/pjlib-util/lib"
      "${PJSIP_ROOT}/pjnath/lib"
      "${PJSIP_ROOT}/pjmedia/lib"
      "${PJSIP_ROOT}/pjsip/lib"
      "${PJSIP_ROOT}/pjsip-apps/lib"
      "${PJSIP_ROOT}/third_party/lib")
  file(GLOB_RECURSE _PJSIP_DISCOVERED_PATHS LIST_DIRECTORIES true "${PJSIP_ROOT}/*")
  foreach(_pjsip_path IN LISTS _PJSIP_DISCOVERED_PATHS)
    if(IS_DIRECTORY "${_pjsip_path}")
      list(APPEND _PJSIP_LIBRARY_DIR_HINTS "${_pjsip_path}")
    endif()
  endforeach()
  list(REMOVE_DUPLICATES _PJSIP_LIBRARY_DIR_HINTS)

  set(_PJSIP_NAMED_LIBRARIES
      pjsua-lib
      pjsip-ua
      pjsip-simple
      pjsip-core
      pjmedia
      pjmedia-codec
      pjnath
      pjlib
      pjlib-util
      libpjproject
  )
  foreach(_pjsip_lib_name IN LISTS _PJSIP_NAMED_LIBRARIES)
    _pjsip_resolve_library(_pjsip_resolved_library "${_pjsip_lib_name}")
    if(_pjsip_resolved_library)
      list(APPEND PJSIP_LIBRARIES "${_pjsip_resolved_library}")
    endif()
  endforeach()
  list(REMOVE_DUPLICATES PJSIP_LIBRARIES)

  if(WIN32)
    list(APPEND PJSIP_LIBRARIES
         ws2_32
         wsock32
         iphlpapi
         winmm
         ole32
         oleaut32
         uuid
         secur32
         advapi32
         avrt
         legacy_stdio_definitions)
  endif()

  if(NOT PJSIP_PJSUA_LIB_LIBRARY AND NOT _PJSIP_NOT_FOUND_MESSAGE)
    set(_PJSIP_NOT_FOUND_MESSAGE
        "Could not find the required pjsua-lib library under PJSIP_ROOT='${PJSIP_ROOT}'.")
  endif()
endif()

find_package_handle_standard_args(
  PJSIP
  REQUIRED_VARS PJSIP_INCLUDE_DIR PJSIP_PJSUA_LIB_LIBRARY
  FAIL_MESSAGE "${_PJSIP_NOT_FOUND_MESSAGE}"
)

if(PJSIP_FOUND AND NOT TARGET PJSIP::PJSIP)
  add_library(PJSIP::PJSIP INTERFACE IMPORTED)
  set_target_properties(
    PJSIP::PJSIP
    PROPERTIES
      INTERFACE_INCLUDE_DIRECTORIES "${PJSIP_INCLUDE_DIR}"
  )
  if(PJSIP_LIBRARIES)
    set_target_properties(
      PJSIP::PJSIP
      PROPERTIES
        INTERFACE_LINK_LIBRARIES "${PJSIP_LIBRARIES}"
    )
  endif()
endif()
