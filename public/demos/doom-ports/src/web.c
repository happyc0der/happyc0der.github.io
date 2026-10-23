/* ------------------------------------------------------------------
 * Browser driver for the DOOMCE engine (portfolio demo).
 *
 * Copyright (C) 2026 happyc0der
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.  See main.c and
 * https://www.gnu.org/licenses/.
 *
 * Modelled on hosttest/play.c from happyc0der/doom-ports: it compiles
 * the same, unmodified src/main.c against the repo's stub graphx /
 * keypadc / tice headers.  SDL is replaced by a canvas blit and a key
 * mask written from JavaScript.  ce_main() is the calculator's own
 * blocking game loop; under -sASYNCIFY, gfx_SwapDraw() yields to the
 * browser with emscripten_sleep() to hold the frame cap.
 *
 * Differences from play.c, all in this file:
 *   - a door key (play.c never sets kb_Alpha, so doors could not open)
 *   - pause while the frame is hidden, unfocused or scrolled away
 *   - no tuning keys and no depth-buffer view
 * ------------------------------------------------------------------ */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>

uint8_t  host_buf[2][320*240];
uint16_t host_pal[256];
uint8_t *host_draw = host_buf[0];
uint8_t  host_color, host_fg;
int      host_tx, host_ty;
uint8_t  kb_Data[8];
uint32_t timer_Control, timer_1_Counter;

#define BUF_A host_buf[0]
#define BUF_B host_buf[1]
#define main  ce_main
#include "main.c"
#undef main

/* key mask bits, set from JavaScript */
enum {
    K_UP = 1, K_DOWN = 2, K_LEFT = 4, K_RIGHT = 8,
    K_STRAFE_L = 16, K_STRAFE_R = 32, K_FIRE = 64, K_DOOR = 128
};

static uint32_t keys;
static int      capFps = 20;
static int      paused;
static int      resetReq;
static double   nextFrame;      /* ms, emscripten_get_now() clock        */
static double   pausedMs;       /* time spent paused, kept off the timer */
static double   wokeAt;         /* when the last frame's sleep ended     */
static uint32_t pal32[256];
static uint32_t rgba[320*240];

EMSCRIPTEN_KEEPALIVE void set_keys(int mask)  { keys = (uint32_t)mask; }
EMSCRIPTEN_KEEPALIVE void set_paused(int p)   { paused = p; }
EMSCRIPTEN_KEEPALIVE void request_reset(void) { resetReq = 1; }
EMSCRIPTEN_KEEPALIVE void set_cap(int fps)
{
    if (fps < 1)  fps = 1;
    if (fps > 60) fps = 60;
    capFps = fps;
    nextFrame = 0;
}

/* hand the finished frame and a few game values to the page:
 * health, ammo, kills, dead, fps, x, y (8.8 cells), angle, doors open,
 * and the microseconds this frame's game logic and rendering took */
enum { ST_N = 10 };
static int32_t state[ST_N];
EM_JS(void, present, (const uint32_t *px, const int32_t *st), {
    Module['present'](HEAPU8.subarray(px, px + 320 * 240 * 4),
                      Array.from(HEAP32.subarray(st >> 2, (st >> 2) + 10)));
});

/* ---- input ------------------------------------------------------- */

void kb_Scan(void)
{
    uint32_t k = keys;

    if (resetReq) {                     /* R in play.c */
        resetReq = 0;
        health = 100; ammo = 50; kills = 0;
        init_world();
    }

    memset(kb_Data, 0, sizeof kb_Data);
    if (k & K_UP)       kb_Data[7] |= kb_Up;
    if (k & K_DOWN)     kb_Data[7] |= kb_Down;
    if (k & K_LEFT)     kb_Data[7] |= kb_Left;
    if (k & K_RIGHT)    kb_Data[7] |= kb_Right;
    if (k & K_STRAFE_L) kb_Data[1] |= kb_Yequ;    /* Y=    */
    if (k & K_STRAFE_R) kb_Data[1] |= kb_Graph;   /* GRAPH */
    if (k & K_FIRE)     kb_Data[1] |= kb_2nd;     /* 2nd   */
    if (k & K_DOOR)     kb_Data[2] |= kb_Alpha;   /* ALPHA */
}

/* ---- present ----------------------------------------------------- */

void gfx_SwapDraw(void)
{
    double now, work = wokeAt ? emscripten_get_now() - wokeAt : 0;

    /* same 1555 decode as play.c: c & 31 is red.  ImageData wants the
     * bytes R, G, B, A, which is 0xAABBGGRR as a little-endian word. */
    for (int i = 0; i < 256; i++) {
        uint16_t c = host_pal[i];
        pal32[i] = 0xFF000000u
                 | (uint32_t)(((c >> 10) & 31) * 255 / 31) << 16
                 | (uint32_t)(((c >> 5)  & 31) * 255 / 31) << 8
                 | (uint32_t)(( c        & 31) * 255 / 31);
    }
    for (int i = 0; i < 320*240; i++) rgba[i] = pal32[host_draw[i]];
    {
        int open = 0;
        for (int i = 0; i < ndoor; i++) open += doors[i].open > 0;
        state[0] = health; state[1] = ammo; state[2] = kills;
        state[3] = deadTic != 0; state[4] = (int)curFps;
        state[5] = px; state[6] = py; state[7] = pa; state[8] = open;
        state[9] = (int32_t)(work * 1000.0);
    }
    present(rgba, state);

    host_draw = (host_draw == host_buf[0]) ? host_buf[1] : host_buf[0];

    /* pace to capFps: movement in main.c is per frame, as on the CE */
    now = emscripten_get_now();
    {
        double period = 1000.0 / capFps;
        if (nextFrame == 0) nextFrame = now;
        nextFrame += period;
        if (nextFrame > now) {
            emscripten_sleep((unsigned)(nextFrame - now));
        } else {
            nextFrame = now;            /* behind: don't spiral, but yield */
            emscripten_sleep(0);
        }
    }

    if (paused) {
        double t0 = emscripten_get_now();
        while (paused) emscripten_sleep(200);
        pausedMs += emscripten_get_now() - t0;
        nextFrame = 0;
    }

    /* the CE's 32768 Hz timer, so the HUD's fps readout is measured */
    wokeAt = emscripten_get_now();
    timer_1_Counter = (uint32_t)(uint64_t)((wokeAt - pausedMs) * 32.768);
}

int main(void)
{
    ce_main();      /* the calculator's own main(), unmodified */
    return 0;
}
