/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A null WebAssembly Micro Runtime for the browser build of the Atlas lab (portfolio demo
 * atlas-lab).
 *
 * Atlas runs mods in WAMR 2.4.5's classic interpreter (engine/script). That interpreter calls
 * host functions through a generic function pointer with a guessed signature, which
 * WebAssembly itself forbids (an indirect call must match its callee's type exactly), so WAMR
 * cannot be compiled for the browser as Atlas configures it. Atlas's own script module is
 * compiled unchanged; this file stands in for the library beneath it. Initialisation fails,
 * so `script::Runtime::create` reports the failure in Atlas's own words, and nothing else is
 * ever reached. The lab runs without --mod, which needs no runtime at all.
 *
 * Declarations come from WAMR's wasm_export.h (Apache-2.0 WITH LLVM-exception).
 */
#include <stdio.h>
#include <wasm_export.h>

bool wasm_runtime_full_init(RuntimeInitArgs *init_args) {
    (void)init_args;
    fprintf(stderr, "atlas web: mods need WAMR, which this browser build does not include\n");
    return false;
}
void wasm_runtime_destroy(void) {}
bool wasm_runtime_register_natives(const char *module_name, NativeSymbol *native_symbols,
                                   uint32_t n_native_symbols) {
    (void)module_name; (void)native_symbols; (void)n_native_symbols;
    return false;
}
wasm_module_t wasm_runtime_load(uint8_t *buf, uint32_t size, char *error_buf,
                                uint32_t error_buf_size) {
    (void)buf; (void)size;
    if (error_buf != NULL && error_buf_size > 0) {
        snprintf(error_buf, error_buf_size, "WAMR is not part of this browser build");
    }
    return NULL;
}
void wasm_runtime_unload(wasm_module_t module) { (void)module; }
wasm_module_inst_t wasm_runtime_instantiate_ex(const wasm_module_t module,
                                               const InstantiationArgs *args, char *error_buf,
                                               uint32_t error_buf_size) {
    (void)module; (void)args;
    if (error_buf != NULL && error_buf_size > 0) {
        snprintf(error_buf, error_buf_size, "WAMR is not part of this browser build");
    }
    return NULL;
}
void wasm_runtime_deinstantiate(wasm_module_inst_t module_inst) { (void)module_inst; }
wasm_function_inst_t wasm_runtime_lookup_function(const wasm_module_inst_t module_inst,
                                                  const char *name) {
    (void)module_inst; (void)name;
    return NULL;
}
wasm_exec_env_t wasm_runtime_create_exec_env(wasm_module_inst_t module_inst, uint32_t stack_size) {
    (void)module_inst; (void)stack_size;
    return NULL;
}
void wasm_runtime_destroy_exec_env(wasm_exec_env_t exec_env) { (void)exec_env; }
wasm_module_inst_t wasm_runtime_get_module_inst(wasm_exec_env_t exec_env) {
    (void)exec_env;
    return NULL;
}
bool wasm_runtime_call_wasm(wasm_exec_env_t exec_env, wasm_function_inst_t function, uint32_t argc,
                            uint32_t argv[]) {
    (void)exec_env; (void)function; (void)argc; (void)argv;
    return false;
}
const char *wasm_runtime_get_exception(wasm_module_inst_t module_inst) {
    (void)module_inst;
    return "WAMR is not part of this browser build";
}
bool wasm_runtime_validate_app_addr(wasm_module_inst_t module_inst, uint64_t app_offset,
                                    uint64_t size) {
    (void)module_inst; (void)app_offset; (void)size;
    return false;
}
void *wasm_runtime_addr_app_to_native(wasm_module_inst_t module_inst, uint64_t app_offset) {
    (void)module_inst; (void)app_offset;
    return NULL;
}
int32_t wasm_runtime_get_import_count(const wasm_module_t module) {
    (void)module;
    return 0;
}
void wasm_runtime_get_import_type(const wasm_module_t module, int32_t import_index,
                                  wasm_import_t *import_type) {
    (void)module; (void)import_index; (void)import_type;
}
int32_t wasm_runtime_get_export_count(const wasm_module_t module) {
    (void)module;
    return 0;
}
void wasm_runtime_get_export_type(const wasm_module_t module, int32_t export_index,
                                  wasm_export_t *export_type) {
    (void)module; (void)export_index; (void)export_type;
}
uint32_t wasm_memory_type_get_init_page_count(const wasm_memory_type_t memory_type) {
    (void)memory_type;
    return 0;
}
void wasm_runtime_set_user_data(wasm_exec_env_t exec_env, void *user_data) {
    (void)exec_env; (void)user_data;
}
void *wasm_runtime_get_user_data(wasm_exec_env_t exec_env) {
    (void)exec_env;
    return NULL;
}
void wasm_runtime_set_instruction_count_limit(wasm_exec_env_t exec_env, int instruction_count) {
    (void)exec_env; (void)instruction_count;
}
