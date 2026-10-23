/*
 * tests_entry.c -- lets the page run two of mldsa-auth's own test suites.
 *
 * Copyright (C) 2026 happyc0der. SPDX-License-Identifier: GPL-3.0-only
 *
 * tests/test_handshake.c and tests/test_session.c are compiled UNCHANGED from
 * the mldsa-auth checkout, each with -Dmain=<name> so both fit in one module;
 * their PASS/FAIL lines go to stdout, which the worker forwards to the page.
 * Each suite keeps static state, so the worker makes a fresh module instance
 * for every run.
 */
#include <emscripten/emscripten.h>

int test_handshake_main(void);
int test_session_main(void);

EMSCRIPTEN_KEEPALIVE int run_suite(int which) {
    return which == 0 ? test_handshake_main() : test_session_main();
}
