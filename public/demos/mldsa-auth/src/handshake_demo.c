/*
 * handshake_demo.c -- the shim behind the portfolio's in-browser mldsa-auth demo.
 *
 * Copyright (C) 2026 happyc0der. SPDX-License-Identifier: GPL-3.0-only
 * (it links mldsa-auth, which is GPL-3.0; see BUILD.md next to this file).
 *
 * It runs both parties of the repo's handshake inside one WebAssembly
 * instance, in a Web Worker: Device A is the initiator, Server B the
 * responder. It adds no cryptography and no checks of its own. Every byte
 * count, state, refusal and status it reports comes from mldsa_core
 * (src/protocol + src/crypto) and the liboqs / libsodium builds the repo's
 * own CMake makes. What the shim does add:
 *   - the three fixed identities and the keystores that pin them,
 *   - the "break it" modes, which only change bytes on the wire or which
 *     key a keystore holds before handing them to the real code,
 *   - timing with emscripten_get_now() (performance.now() in the worker),
 *   - a JSON summary for the page.
 */

#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten/emscripten.h>
#include <oqs/oqs.h>
#include <sodium.h>

#include "handshake.h"
#include "keystore.h"
#include "mldsa_wrap.h"
#include "session.h"
#include "transcript.h"

/* ---- identities, pins, contexts ----------------------------------------- */

static const uint8_t ID_A[] = {'d', 'e', 'v', 'i', 'c', 'e', '-', 'a'};
static const uint8_t ID_B[] = {'s', 'e', 'r', 'v', 'e', 'r', '-', 'b'};

static int g_ready = 0;
static mldsa_keypair_t g_kp_a; /* Device A */
static mldsa_keypair_t g_kp_b; /* Server B */
static mldsa_keypair_t g_kp_m; /* a third key nobody should trust */

static keystore_t g_ks_dev;       /* A's pins: server-b -> B */
static keystore_t g_ks_dev_wrong; /* A's pins: server-b -> the third key */
static keystore_t g_ks_srv;       /* B's pins: device-a -> A */
static keystore_t g_ks_srv_empty; /* B pins nobody */

static handshake_pending_store_t g_store;
static handshake_ctx_t g_ini;
static handshake_ctx_t g_res;
static session_t g_s_ini; /* A's session */
static session_t g_s_res; /* B's session */

static uint8_t g_ch[CLIENT_HELLO_MAX_ENCODED_LEN];
static uint8_t g_sh[SERVER_HELLO_MAX_ENCODED_LEN];
static uint8_t g_ca[CLIENT_AUTH_MAX_ENCODED_LEN];
static uint8_t g_ca_forged[CLIENT_AUTH_MAX_ENCODED_LEN];
static size_t g_ch_len, g_sh_len, g_ca_len;

static uint8_t g_rec[SESSION_MAX_RECORD_BYTES];
static uint8_t g_rec2[SESSION_MAX_RECORD_BYTES];
static uint8_t g_pt[SESSION_OPEN_CAP_FOR(SESSION_MAX_RECORD_BYTES)];

/* ---- a tiny JSON writer into one static buffer --------------------------- */

static char g_json[65536];
static size_t g_jlen;

static void j_reset(void) { g_jlen = 0; g_json[0] = '\0'; }

static void j_printf(const char *fmt, ...) {
    if (g_jlen >= sizeof g_json - 1) return;
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(g_json + g_jlen, sizeof g_json - g_jlen, fmt, ap);
    va_end(ap);
    if (n > 0) {
        g_jlen += (size_t)n;
        if (g_jlen > sizeof g_json - 1) g_jlen = sizeof g_json - 1;
    }
}

static void j_hex(const uint8_t *p, size_t n) {
    static char hex[2 * 4096 + 1];
    if (n > 4096) n = 4096;
    sodium_bin2hex(hex, sizeof hex, p, n);
    j_printf("\"%s\"", hex);
}

/* ---- names for the library's own enums ----------------------------------- */

static const char *hs_status_name(handshake_status_t s) {
    static const char *names[] = {
        "HANDSHAKE_OK", "HANDSHAKE_ERR_INVALID_ARG", "HANDSHAKE_ERR_UNEXPECTED_STATE",
        "HANDSHAKE_ERR_MALFORMED", "HANDSHAKE_ERR_UNKNOWN_IDENTITY",
        "HANDSHAKE_ERR_IDENTITY_KEY_MISMATCH", "HANDSHAKE_ERR_PEER_IDENTITY_MISMATCH",
        "HANDSHAKE_ERR_SESSION_ID_MISMATCH", "HANDSHAKE_ERR_HANDSHAKE_ID_MISMATCH",
        "HANDSHAKE_ERR_REPLAY", "HANDSHAKE_ERR_EXPIRED", "HANDSHAKE_ERR_SIGNATURE",
        "HANDSHAKE_ERR_AUTH_FAILURE_LIMIT", "HANDSHAKE_ERR_KEX",
        "HANDSHAKE_ERR_RESOURCE_EXHAUSTED", "HANDSHAKE_ERR_INTERNAL"};
    return ((unsigned)s < sizeof names / sizeof names[0]) ? names[s] : "HANDSHAKE_?";
}

static const char *hs_state_name(handshake_state_t s) {
    static const char *names[] = {
        "NEW", "CLIENT_HELLO_CREATED", "SERVER_HELLO_VERIFIED", "CLIENT_AUTH_CREATED",
        "CLIENT_HELLO_ACCEPTED", "SERVER_HELLO_CREATED", "CLIENT_AUTH_VERIFIED",
        "ESTABLISHED", "FAILED"};
    return ((unsigned)s < sizeof names / sizeof names[0]) ? names[s] : "?";
}

static const char *se_status_name(session_status_t s) {
    static const char *names[] = {
        "SESSION_OK", "SESSION_ERR_INVALID_ARG", "SESSION_ERR_UNEXPECTED_STATE",
        "SESSION_ERR_MALFORMED", "SESSION_ERR_REPLAY", "SESSION_ERR_OUT_OF_ORDER",
        "SESSION_ERR_AUTH", "SESSION_ERR_LIMIT", "SESSION_ERR_EXPIRED",
        "SESSION_ERR_RESOURCE_EXHAUSTED", "SESSION_ERR_INTERNAL"};
    return ((unsigned)s < sizeof names / sizeof names[0]) ? names[s] : "SESSION_?";
}

static const char *se_state_name(session_state_t s) {
    static const char *names[] = {"EMPTY", "ACTIVE", "EXPIRED", "FAILED"};
    return ((unsigned)s < sizeof names / sizeof names[0]) ? names[s] : "?";
}

/* ---- randomness: the repo's own wasm pattern (apps/authd/client_core.c) --- */

static void oqs_rng_from_sodium(uint8_t *buf, size_t n) { randombytes_buf(buf, n); }

/* ---- setup ---------------------------------------------------------------- */

static void fp8(char out[17], const uint8_t *p, size_t n) {
    uint8_t h[8];
    crypto_generichash(h, sizeof h, p, n, NULL, 0);
    sodium_bin2hex(out, 17, h, sizeof h);
}

/* Generates the three ML-DSA-65 identities and pins them. Returns JSON. */
EMSCRIPTEN_KEEPALIVE const char *hd_init(void) {
    j_reset();
    if (!g_ready) {
        if (sodium_init() < 0) {
            j_printf("{\"ok\":false,\"error\":\"sodium_init failed\"}");
            return g_json;
        }
        OQS_randombytes_custom_algorithm(oqs_rng_from_sodium);
    }
    mldsa_keypair_free(&g_kp_a);
    mldsa_keypair_free(&g_kp_b);
    mldsa_keypair_free(&g_kp_m);

    double t[4];
    t[0] = emscripten_get_now();
    int rc = mldsa_keypair_generate(&g_kp_a);
    t[1] = emscripten_get_now();
    rc |= mldsa_keypair_generate(&g_kp_b);
    t[2] = emscripten_get_now();
    rc |= mldsa_keypair_generate(&g_kp_m);
    t[3] = emscripten_get_now();
    if (rc != 0) {
        j_printf("{\"ok\":false,\"error\":\"mldsa_keypair_generate failed\"}");
        return g_json;
    }

    keystore_init(&g_ks_dev);
    keystore_init(&g_ks_dev_wrong);
    keystore_init(&g_ks_srv);
    keystore_init(&g_ks_srv_empty);
    keystore_status_t k1 = keystore_add(&g_ks_dev, ID_B, sizeof ID_B, g_kp_b.public_key);
    keystore_status_t k2 = keystore_add(&g_ks_dev_wrong, ID_B, sizeof ID_B, g_kp_m.public_key);
    keystore_status_t k3 = keystore_add(&g_ks_srv, ID_A, sizeof ID_A, g_kp_a.public_key);
    if (k1 != KEYSTORE_OK || k2 != KEYSTORE_OK || k3 != KEYSTORE_OK) {
        j_printf("{\"ok\":false,\"error\":\"keystore_add failed\"}");
        return g_json;
    }
    g_ready = 1;

    char fa[17], fb[17], fm[17];
    fp8(fa, g_kp_a.public_key, MLDSA_PUBLIC_KEY_BYTES);
    fp8(fb, g_kp_b.public_key, MLDSA_PUBLIC_KEY_BYTES);
    fp8(fm, g_kp_m.public_key, MLDSA_PUBLIC_KEY_BYTES);
    j_printf("{\"ok\":true,\"liboqs\":\"%s\",\"libsodium\":\"%s\",", OQS_VERSION_TEXT,
             sodium_version_string());
    j_printf("\"pk_bytes\":%u,\"sk_bytes\":%u,\"sig_bytes\":%u,", MLDSA_PUBLIC_KEY_BYTES,
             MLDSA_SECRET_KEY_BYTES, MLDSA_SIGNATURE_MAX_BYTES);
    j_printf("\"keygen_ms\":[%.4f,%.4f,%.4f],", t[1] - t[0], t[2] - t[1], t[3] - t[2]);
    j_printf("\"fp\":{\"a\":\"%s\",\"b\":\"%s\",\"m\":\"%s\"},", fa, fb, fm);
    j_printf("\"id_a\":\"device-a\",\"id_b\":\"server-b\"}");
    return g_json;
}

static void wipe_all(void) {
    session_wipe(&g_s_ini);
    session_wipe(&g_s_res);
    handshake_ctx_wipe(&g_ini);
    handshake_ctx_wipe(&g_res);
    handshake_pending_store_wipe(&g_store);
    memset(&g_ini, 0, sizeof g_ini);
    memset(&g_res, 0, sizeof g_res);
}

/* Fresh store and contexts: the untimed "prepare" step, as bench/ does. */
static handshake_status_t prepare(const keystore_t *dev_ks, const keystore_t *srv_ks) {
    wipe_all();
    if (handshake_pending_store_init(&g_store, 16, HANDSHAKE_PENDING_TTL_MS_DEFAULT, NULL, NULL) !=
        PENDING_OK) {
        return HANDSHAKE_ERR_INTERNAL;
    }
    handshake_status_t st =
        handshake_initiator_init(&g_ini, ID_A, sizeof ID_A, &g_kp_a, dev_ks, ID_B, sizeof ID_B);
    if (st != HANDSHAKE_OK) return st;
    return handshake_responder_init(&g_res, ID_B, sizeof ID_B, &g_kp_b, srv_ks, &g_store);
}

/* ---- the ServerHello's fields, for "flip a byte" ---------------------------
 * Wire order from src/protocol/transcript.c write_server_hello_unsigned_unchecked()
 * and encode_server_hello(). */

typedef struct {
    const char *name;
    size_t off;
    size_t len;
} field_t;

static size_t sh_fields(field_t f[9], size_t sh_len) {
    size_t o = 0, i = 0;
#define FIELD(n, l) do { f[i].name = (n); f[i].off = o; f[i].len = (l); o += (l); i++; } while (0)
    FIELD("message type", 1);
    FIELD("id length", 1);
    FIELD("server id", sizeof ID_B);
    FIELD("X25519 ephemeral key", WIRE_X25519_PUB_LEN);
    FIELD("ML-KEM-768 ciphertext", WIRE_MLKEM_CT_LEN);
    FIELD("nonce", WIRE_NONCE_LEN);
    FIELD("session-id echo", WIRE_SESSION_ID_LEN);
    FIELD("signature length", 2);
    FIELD("ML-DSA-65 signature", sh_len > o ? sh_len - o : 0);
#undef FIELD
    return i;
}

/* ---- one handshake, step by step ----------------------------------------- */

enum {
    MODE_HONEST = 0,
    MODE_FLIP_SH = 1,     /* flip one bit of one ServerHello byte in transit */
    MODE_WRONG_PIN = 2,   /* A has pinned a different key for server-b */
    MODE_UNKNOWN_DEV = 3, /* B has no pin for device-a */
    MODE_FORGE_CA = 4     /* a forged ClientAuth arrives first, then the real one */
};

static int g_nsteps;

static int step(const char *party, const char *call, handshake_status_t st, double ms,
                const char *msg, const uint8_t *bytes, size_t len, handshake_state_t state,
                const char *note) {
    j_printf("%s{\"party\":\"%s\",\"call\":\"%s\",\"status\":\"%s\",\"ok\":%s,\"ms\":%.4f,"
             "\"state\":\"%s\"",
             g_nsteps++ ? "," : "", party, call, hs_status_name(st), st == HANDSHAKE_OK ? "true" : "false",
             ms, hs_state_name(state));
    if (msg) {
        j_printf(",\"msg\":\"%s\",\"bytes\":%zu,\"head\":", msg, len);
        j_hex(bytes, len < 24 ? len : 24);
    }
    if (note) j_printf(",\"note\":\"%s\"", note);
    j_printf("}");
    return st == HANDSHAKE_OK;
}

/* mode: MODE_*; field: for MODE_FLIP_SH, index into sh_fields() or -1 for any byte. */
EMSCRIPTEN_KEEPALIVE const char *hd_handshake(int mode, int field) {
    j_reset();
    if (!g_ready) {
        j_printf("{\"ok\":false,\"error\":\"call hd_init first\"}");
        return g_json;
    }
    const keystore_t *dev_ks = mode == MODE_WRONG_PIN ? &g_ks_dev_wrong : &g_ks_dev;
    const keystore_t *srv_ks = mode == MODE_UNKNOWN_DEV ? &g_ks_srv_empty : &g_ks_srv;
    handshake_status_t st = prepare(dev_ks, srv_ks);
    if (st != HANDSHAKE_OK) {
        j_printf("{\"ok\":false,\"error\":\"context init: %s\"}", hs_status_name(st));
        return g_json;
    }

    g_nsteps = 0;
    double t0, t1, total = 0;
    char tamper_note[160] = {0};
    j_printf("{\"mode\":%d,\"steps\":[", mode);

#define TIMED(expr) (t0 = emscripten_get_now(), st = (expr), t1 = emscripten_get_now(), total += t1 - t0, t1 - t0)

    double ms = TIMED(handshake_initiator_create_client_hello(&g_ini, g_ch, sizeof g_ch, &g_ch_len));
    if (!step("A", "handshake_initiator_create_client_hello", st, ms, "ClientHello", g_ch, g_ch_len,
              handshake_get_state(&g_ini), NULL)) goto done;

    ms = TIMED(handshake_responder_accept_client_hello(&g_res, g_ch, g_ch_len));
    if (!step("B", "handshake_responder_accept_client_hello", st, ms, NULL, NULL, 0,
              handshake_get_state(&g_res), NULL)) goto done;

    ms = TIMED(handshake_responder_create_server_hello(&g_res, g_sh, sizeof g_sh, &g_sh_len));
    if (!step("B", "handshake_responder_create_server_hello", st, ms, "ServerHello", g_sh, g_sh_len,
              handshake_get_state(&g_res), NULL)) goto done;

    if (mode == MODE_FLIP_SH) {
        field_t f[9];
        size_t nf = sh_fields(f, g_sh_len);
        size_t off;
        const char *fname = NULL;
        if (field >= 0 && (size_t)field < nf && f[field].len > 0) {
            off = f[field].off + randombytes_uniform((uint32_t)f[field].len);
            fname = f[field].name;
        } else {
            off = randombytes_uniform((uint32_t)g_sh_len);
            for (size_t i = 0; i < nf; i++) {
                if (off >= f[i].off && off < f[i].off + f[i].len) fname = f[i].name;
            }
        }
        uint8_t bit = (uint8_t)(1u << randombytes_uniform(8));
        g_sh[off] ^= bit;
        snprintf(tamper_note, sizeof tamper_note, "in transit: flipped bit 0x%02x of byte %zu of %zu (%s)",
                 bit, off, g_sh_len, fname ? fname : "?");
        j_printf(",{\"party\":\"wire\",\"tamper\":\"%s\",\"offset\":%zu,\"field\":\"%s\"}", tamper_note,
                 off, fname ? fname : "?");
    }

    ms = TIMED(handshake_initiator_verify_server_hello(&g_ini, g_sh, g_sh_len));
    if (!step("A", "handshake_initiator_verify_server_hello", st, ms, NULL, NULL, 0,
              handshake_get_state(&g_ini), mode == MODE_WRONG_PIN ? "A checks sig_B against the key it pinned for server-b" : NULL))
        goto done;

    ms = TIMED(handshake_initiator_create_client_auth(&g_ini, g_ca, sizeof g_ca, &g_ca_len));
    if (!step("A", "handshake_initiator_create_client_auth", st, ms, "ClientAuth", g_ca, g_ca_len,
              handshake_get_state(&g_ini), NULL)) goto done;

    if (mode == MODE_FORGE_CA) {
        /* A ClientAuth with the right handshake_id and one signature byte
         * changed: what an attacker without A's key could send. Layout:
         * type (1) || handshake_id (16) || sig_len (2) || sig. */
        memcpy(g_ca_forged, g_ca, g_ca_len);
        size_t sig_off = 1 + WIRE_HANDSHAKE_ID_LEN + 2;
        size_t off = sig_off + randombytes_uniform((uint32_t)(g_ca_len - sig_off));
        g_ca_forged[off] ^= 0x01;
        snprintf(tamper_note, sizeof tamper_note,
                 "forged ClientAuth delivered first (byte %zu of the signature changed)", off - sig_off);
        j_printf(",{\"party\":\"wire\",\"tamper\":\"%s\",\"offset\":%zu,\"field\":\"ML-DSA-65 signature\"}",
                 tamper_note, off);
        ms = TIMED(handshake_responder_verify_client_auth(&g_res, g_ca_forged, g_ca_len));
        uint8_t fails = 0;
        pending_slot_state_t ps;
        /* handshake_id is public: ClientAuth carries it in the clear (bytes 1..16). */
        handshake_pending_inspect(&g_store, g_ca + 1, &ps, &fails);
        char note[96];
        snprintf(note, sizeof note, "retryable: state unchanged, failure %u of %u counted", fails,
                 HANDSHAKE_AUTH_FAILURE_LIMIT);
        step("B", "handshake_responder_verify_client_auth", st, ms, "ClientAuth (forged)", g_ca_forged,
             g_ca_len, handshake_get_state(&g_res), note);
        if (handshake_get_state(&g_res) != HANDSHAKE_STATE_SERVER_HELLO_CREATED) goto done;
    }

    ms = TIMED(handshake_responder_verify_client_auth(&g_res, g_ca, g_ca_len));
    if (!step("B", "handshake_responder_verify_client_auth", st, ms,
              mode == MODE_FORGE_CA ? "ClientAuth (genuine)" : NULL, g_ca, mode == MODE_FORGE_CA ? g_ca_len : 0,
              handshake_get_state(&g_res), NULL)) goto done;

    ms = TIMED(handshake_initiator_finish(&g_ini));
    if (!step("A", "handshake_initiator_finish", st, ms, NULL, NULL, 0, handshake_get_state(&g_ini),
              "X25519 + ML-KEM decapsulation + HKDF")) goto done;

    ms = TIMED(handshake_responder_finish(&g_res));
    if (!step("B", "handshake_responder_finish", st, ms, NULL, NULL, 0, handshake_get_state(&g_res),
              NULL)) goto done;
#undef TIMED

done:;
    const int established = handshake_get_state(&g_ini) == HANDSHAKE_STATE_ESTABLISHED &&
                            handshake_get_state(&g_res) == HANDSHAKE_STATE_ESTABLISHED;
    j_printf("],\"handshake_ms\":%.4f,\"established\":%s", total, established ? "true" : "false");
    j_printf(",\"state_a\":\"%s\",\"state_b\":\"%s\"", hs_state_name(handshake_get_state(&g_ini)),
             hs_state_name(handshake_get_state(&g_res)));
    j_printf(",\"sizes\":{\"ch\":%zu,\"sh\":%zu,\"ca\":%zu}", g_ch_len, g_sh_len, g_ca_len);

    if (established) {
        const uint8_t *ac2s = NULL, *as2c = NULL, *bc2s = NULL, *bs2c = NULL;
        handshake_session_key_c2s(&g_ini, &ac2s);
        handshake_session_key_s2c(&g_ini, &as2c);
        handshake_session_key_c2s(&g_res, &bc2s);
        handshake_session_key_s2c(&g_res, &bs2c);
        char f1[17], f2[17], f3[17], f4[17];
        fp8(f1, ac2s, KEX_SESSION_KEY_BYTES);
        fp8(f2, as2c, KEX_SESSION_KEY_BYTES);
        fp8(f3, bc2s, KEX_SESSION_KEY_BYTES);
        fp8(f4, bs2c, KEX_SESSION_KEY_BYTES);
        uint8_t hid[WIRE_HANDSHAKE_ID_LEN];
        handshake_get_handshake_id(&g_ini, hid);
        j_printf(",\"keys\":{\"a_c2s\":\"%s\",\"a_s2c\":\"%s\",\"b_c2s\":\"%s\",\"b_s2c\":\"%s\",\"match\":%s},"
                 "\"handshake_id\":",
                 f1, f2, f3, f4,
                 (sodium_memcmp(ac2s, bc2s, KEX_SESSION_KEY_BYTES) == 0 &&
                  sodium_memcmp(as2c, bs2c, KEX_SESSION_KEY_BYTES) == 0) ? "true" : "false");
        j_hex(hid, sizeof hid);

        /* Both sides open sessions (consuming the handshake contexts); B sends
         * the empty confirmation record session.h recommends, A opens it. */
        session_status_t s1 = session_init_from_handshake(&g_s_res, &g_res, NULL, NULL, NULL);
        session_status_t s2 = session_init_from_handshake(&g_s_ini, &g_ini, NULL, NULL, NULL);
        size_t rl = 0, pl = 0;
        session_status_t s3 = SESSION_ERR_UNEXPECTED_STATE, s4 = SESSION_ERR_UNEXPECTED_STATE;
        if (s1 == SESSION_OK && s2 == SESSION_OK) {
            s3 = session_seal(&g_s_res, NULL, 0, g_rec, sizeof g_rec, &rl);
            if (s3 == SESSION_OK) s4 = session_open(&g_s_ini, g_rec, rl, g_pt, sizeof g_pt, &pl);
        }
        j_printf(",\"confirm\":{\"init_b\":\"%s\",\"init_a\":\"%s\",\"seal\":\"%s\",\"open\":\"%s\","
                 "\"record_bytes\":%zu,\"a_confirmed\":%s,\"b_confirmed\":%s,\"head\":",
                 se_status_name(s1), se_status_name(s2), se_status_name(s3), se_status_name(s4), rl,
                 session_is_peer_confirmed(&g_s_ini) ? "true" : "false",
                 session_is_peer_confirmed(&g_s_res) ? "true" : "false");
        j_hex(g_rec, rl < 24 ? rl : 24);
        j_printf("}");
    }
    j_printf(",\"ok\":true}");
    return g_json;
}

/* ---- the record layer ------------------------------------------------------ */

enum { REC_DELIVER = 0, REC_TAMPER = 1, REC_REPLAY = 2, REC_DROP = 3 };

static uint64_t rec_seq(const uint8_t *r) {
    uint64_t v = 0;
    for (int i = 1; i <= 8; i++) v = (v << 8) | r[i];
    return v;
}

static void j_record(const char *key, const uint8_t *r, size_t rl) {
    j_printf(",\"%s\":{\"bytes\":%zu,\"type\":%u,\"seq\":%llu,\"header\":", key, rl, r[0],
             (unsigned long long)rec_seq(r));
    j_hex(r, SESSION_HEADER_BYTES);
    j_printf(",\"body_head\":");
    size_t body = rl - SESSION_HEADER_BYTES - 16;
    j_hex(r + SESSION_HEADER_BYTES, body < 24 ? body : 24);
    j_printf(",\"tag\":");
    j_hex(r + rl - 16, 16);
    j_printf("}");
}

/* dir 0: A -> B (initiator sends, c2s). dir 1: B -> A. */
EMSCRIPTEN_KEEPALIVE const char *hd_send(int dir, const uint8_t *msg, int len, int attack) {
    j_reset();
    session_t *tx = dir == 0 ? &g_s_ini : &g_s_res;
    session_t *rx = dir == 0 ? &g_s_res : &g_s_ini;
    if (len < 0 || (size_t)len > SESSION_MAX_CONTENT_BYTES) {
        j_printf("{\"ok\":false,\"error\":\"message too long\"}");
        return g_json;
    }
    size_t rl = 0, rl2 = 0, pl = 0;
    double t0 = emscripten_get_now();
    session_status_t ss = session_seal(tx, msg, (size_t)len, g_rec, sizeof g_rec, &rl);
    double seal_ms = emscripten_get_now() - t0;
    j_printf("{\"ok\":true,\"dir\":%d,\"attack\":%d,\"content_bytes\":%d,\"seal\":\"%s\",\"seal_ms\":%.4f",
             dir, attack, len, se_status_name(ss), seal_ms);
    if (ss != SESSION_OK) {
        j_printf(",\"tx_state\":\"%s\",\"rx_state\":\"%s\"}", se_state_name(session_get_state(tx)),
                 se_state_name(session_get_state(rx)));
        return g_json;
    }
    j_record("record", g_rec, rl);

    const uint8_t *deliver = g_rec;
    size_t deliver_len = rl;
    if (attack == REC_TAMPER) {
        size_t off = SESSION_HEADER_BYTES + randombytes_uniform((uint32_t)(rl - SESSION_HEADER_BYTES));
        g_rec[off] ^= 0x01;
        j_printf(",\"tamper\":{\"offset\":%zu,\"region\":\"%s\"}", off,
                 off >= rl - 16 ? "Poly1305 tag" : "ciphertext");
    } else if (attack == REC_DROP) {
        /* The first record is lost; the sender's next one arrives. */
        session_status_t s2 = session_seal(tx, msg, (size_t)len, g_rec2, sizeof g_rec2, &rl2);
        j_printf(",\"seal2\":\"%s\"", se_status_name(s2));
        if (s2 != SESSION_OK) {
            j_printf("}");
            return g_json;
        }
        j_record("record2", g_rec2, rl2);
        deliver = g_rec2;
        deliver_len = rl2;
    }

    t0 = emscripten_get_now();
    session_status_t so = session_open(rx, deliver, deliver_len, g_pt, sizeof g_pt, &pl);
    double open_ms = emscripten_get_now() - t0;
    j_printf(",\"open\":\"%s\",\"open_ms\":%.4f", se_status_name(so), open_ms);
    if (so == SESSION_OK) {
        j_printf(",\"plaintext\":");
        j_hex(g_pt, pl < 4096 ? pl : 4096);
    }
    if (attack == REC_REPLAY && so == SESSION_OK) {
        session_status_t so2 = session_open(rx, g_rec, rl, g_pt, sizeof g_pt, &pl);
        j_printf(",\"open2\":\"%s\"", se_status_name(so2));
    }
    j_printf(",\"tx_state\":\"%s\",\"rx_state\":\"%s\",\"a_confirmed\":%s}",
             se_state_name(session_get_state(tx)), se_state_name(session_get_state(rx)),
             session_is_peer_confirmed(&g_s_ini) ? "true" : "false");
    return g_json;
}

/* ---- benchmarks -------------------------------------------------------------
 * Same shape as bench/bench_handshake.c's in-process end-to-end row: a fresh
 * store and contexts are prepared OUTSIDE the timed region, then the eight
 * calls are timed. out receives 9 doubles per run: total, then each phase. */

EMSCRIPTEN_KEEPALIVE int hd_bench(int n, double *out) {
    if (!g_ready || n <= 0) return -1;
    int done = 0;
    for (int i = 0; i < n; i++) {
        if (prepare(&g_ks_dev, &g_ks_srv) != HANDSHAKE_OK) break;
        double t[9];
        int ok = 1;
        t[0] = emscripten_get_now();
        ok &= handshake_initiator_create_client_hello(&g_ini, g_ch, sizeof g_ch, &g_ch_len) == HANDSHAKE_OK;
        t[1] = emscripten_get_now();
        ok &= handshake_responder_accept_client_hello(&g_res, g_ch, g_ch_len) == HANDSHAKE_OK;
        t[2] = emscripten_get_now();
        ok &= handshake_responder_create_server_hello(&g_res, g_sh, sizeof g_sh, &g_sh_len) == HANDSHAKE_OK;
        t[3] = emscripten_get_now();
        ok &= handshake_initiator_verify_server_hello(&g_ini, g_sh, g_sh_len) == HANDSHAKE_OK;
        t[4] = emscripten_get_now();
        ok &= handshake_initiator_create_client_auth(&g_ini, g_ca, sizeof g_ca, &g_ca_len) == HANDSHAKE_OK;
        t[5] = emscripten_get_now();
        ok &= handshake_responder_verify_client_auth(&g_res, g_ca, g_ca_len) == HANDSHAKE_OK;
        t[6] = emscripten_get_now();
        ok &= handshake_initiator_finish(&g_ini) == HANDSHAKE_OK;
        t[7] = emscripten_get_now();
        ok &= handshake_responder_finish(&g_res) == HANDSHAKE_OK;
        t[8] = emscripten_get_now();
        if (!ok || handshake_get_state(&g_ini) != HANDSHAKE_STATE_ESTABLISHED ||
            handshake_get_state(&g_res) != HANDSHAKE_STATE_ESTABLISHED) {
            break;
        }
        double *o = out + (size_t)i * 9;
        o[0] = t[8] - t[0];
        for (int p = 0; p < 8; p++) o[p + 1] = t[p + 1] - t[p];
        done++;
    }
    wipe_all();
    return done;
}

/* Record sealing/opening at SESSION_MAX_CONTENT_BYTES (bench/'s "64 KiB" row),
 * default pad bucket. Batches of `batch` records are timed as one interval, so
 * a coarse browser timer still gives a usable rate. out: [seal_ms, open_ms,
 * records, content_bytes]. Leaves the demo's own sessions untouched. */
EMSCRIPTEN_KEEPALIVE int hd_record_bench(double budget_ms, double *out) {
    enum { BATCH = 16 };
    if (!g_ready) return -1;
    static handshake_pending_store_t store;
    static handshake_ctx_t ini, res;
    static session_t si, sr;
    session_wipe(&si);
    session_wipe(&sr);
    handshake_ctx_wipe(&ini);
    handshake_ctx_wipe(&res);
    memset(&ini, 0, sizeof ini);
    memset(&res, 0, sizeof res);
    if (handshake_pending_store_init(&store, 4, HANDSHAKE_PENDING_TTL_MS_DEFAULT, NULL, NULL) != PENDING_OK)
        return -2;
    static uint8_t ch[CLIENT_HELLO_MAX_ENCODED_LEN], sh[SERVER_HELLO_MAX_ENCODED_LEN],
        ca[CLIENT_AUTH_MAX_ENCODED_LEN];
    size_t chl, shl, cal;
    int ok = handshake_initiator_init(&ini, ID_A, sizeof ID_A, &g_kp_a, &g_ks_dev, ID_B, sizeof ID_B) == HANDSHAKE_OK &&
             handshake_responder_init(&res, ID_B, sizeof ID_B, &g_kp_b, &g_ks_srv, &store) == HANDSHAKE_OK &&
             handshake_initiator_create_client_hello(&ini, ch, sizeof ch, &chl) == HANDSHAKE_OK &&
             handshake_responder_accept_client_hello(&res, ch, chl) == HANDSHAKE_OK &&
             handshake_responder_create_server_hello(&res, sh, sizeof sh, &shl) == HANDSHAKE_OK &&
             handshake_initiator_verify_server_hello(&ini, sh, shl) == HANDSHAKE_OK &&
             handshake_initiator_create_client_auth(&ini, ca, sizeof ca, &cal) == HANDSHAKE_OK &&
             handshake_responder_verify_client_auth(&res, ca, cal) == HANDSHAKE_OK &&
             handshake_initiator_finish(&ini) == HANDSHAKE_OK &&
             handshake_responder_finish(&res) == HANDSHAKE_OK &&
             session_init_from_handshake(&sr, &res, NULL, NULL, NULL) == SESSION_OK &&
             session_init_from_handshake(&si, &ini, NULL, NULL, NULL) == SESSION_OK;
    handshake_pending_store_wipe(&store);
    if (!ok) return -3;

    const size_t content = SESSION_MAX_CONTENT_BYTES;
    static uint8_t *pt = NULL, *recs = NULL, *back = NULL;
    static size_t rl[BATCH];
    if (!pt) {
        pt = (uint8_t *)malloc(content);
        recs = (uint8_t *)malloc((size_t)BATCH * SESSION_MAX_RECORD_BYTES);
        back = (uint8_t *)malloc(SESSION_OPEN_CAP_FOR(SESSION_MAX_RECORD_BYTES));
        if (!pt || !recs || !back) return -4;
    }
    randombytes_buf(pt, content);
    double seal_ms = 0, open_ms = 0;
    long records = 0;
    double start = emscripten_get_now();
    while (emscripten_get_now() - start < budget_ms) {
        double t0 = emscripten_get_now();
        for (int i = 0; i < BATCH; i++) {
            if (session_seal(&si, pt, content, recs + (size_t)i * SESSION_MAX_RECORD_BYTES,
                             SESSION_MAX_RECORD_BYTES, &rl[i]) != SESSION_OK) return -5;
        }
        double t1 = emscripten_get_now();
        for (int i = 0; i < BATCH; i++) {
            size_t pl = 0;
            if (session_open(&sr, recs + (size_t)i * SESSION_MAX_RECORD_BYTES, rl[i], back,
                             SESSION_OPEN_CAP_FOR(SESSION_MAX_RECORD_BYTES), &pl) != SESSION_OK ||
                pl != content) return -6;
        }
        double t2 = emscripten_get_now();
        seal_ms += t1 - t0;
        open_ms += t2 - t1;
        records += BATCH;
    }
    session_wipe(&si);
    session_wipe(&sr);
    out[0] = seal_ms;
    out[1] = open_ms;
    out[2] = (double)records;
    out[3] = (double)content;
    return 0;
}
