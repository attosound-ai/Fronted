/*
 * Scenario suite for the voice engine self heal decision (AttoHealPolicy.h, in the
 * patched @twilio/voice-react-native-sdk). Each scenario drives AttoHealStep with
 * 250 ms ticks, the same cadence the watchdog uses on the phone, and checks what
 * it decides. Run: scripts/test-native.sh (part of npm run test).
 */
#include <stdio.h>
#include <string.h>
#include "AttoHealPolicy.h"

static int failures = 0;
static int checks = 0;
#define CHECK(cond, ...)                                                   \
    do {                                                                   \
        checks++;                                                          \
        if (!(cond)) {                                                     \
            failures++;                                                    \
            printf("  FAIL %s:%d ", __FILE__, __LINE__);                   \
            printf(__VA_ARGS__);                                           \
            printf("\n");                                                  \
        }                                                                  \
    } while (0)

static const double TICK = 0.25;
static int CTX_A = 1, CTX_B = 2;

typedef struct {
    AttoHealState st;
    AttoHealInput in;
    int stalls, attempts, l1, l2, oks, exhausted, offSkips, disarms;
    int lastLevel, lastCause;
    double lastRecoverMs;
} Sim;

static void sim_init(Sim *s) {
    memset(s, 0, sizeof(*s));
    s->in.context = &CTX_A;
    s->in.enabled = true;
    s->in.hasUnit = true;
    s->in.callLive = true;
    s->in.categoryIsPlayAndRecord = true;
    s->in.callToken = 7; /* on the phone callLive always comes with a call UUID */
    AttoHealArm(&s->st, 0);
}

/* One tick. `advance` = the capture callbacks moved since the last tick. */
static AttoHealOutput sim_tick(Sim *s, bool advance) {
    s->in.now += TICK;
    if (advance) s->in.recCb += 24;
    s->in.sessionChecked = AttoHealSessionCheckDue(&s->st, s->in.now);
    AttoHealOutput o = AttoHealStep(&s->st, &s->in);
    if (o.disarm) s->disarms++;
    if (o.emitStall) s->stalls++;
    if (o.emitResultOk) { s->oks++; s->lastRecoverMs = o.recoverMs; }
    if (o.emitExhausted) s->exhausted++;
    if (o.offSkipFirst) s->offSkips++;
    if (o.attempt > 0) {
        s->attempts++;
        s->lastLevel = o.level;
        if (o.level == 1) s->l1++; else s->l2++;
    }
    if (o.cause) s->lastCause = o.cause;
    return o;
}

static void run(Sim *s, double seconds, bool advance) {
    int n = (int)(seconds / TICK + 0.5);
    for (int i = 0; i < n; i++) sim_tick(s, advance);
}

static void healthy_call_never_heals(void) {
    printf("healthy call for 10 min\n");
    Sim s; sim_init(&s);
    run(&s, 600, true);
    CHECK(s.stalls == 0 && s.attempts == 0 && s.oks == 0, "stalls %d attempts %d", s.stalls, s.attempts);
}

static void larry_oct10_frozen_and_playback(void) {
    printf("Oct 10 Larry call: callbacks frozen at 17, category Playback, nothing helps\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.categoryIsPlayAndRecord = false;
    run(&s, 60, false);
    CHECK(s.stalls == 1, "one stall, got %d", s.stalls);
    CHECK(s.attempts == ATTO_HEAL_MAX_ATTEMPTS, "attempts %d", s.attempts);
    CHECK(s.l1 == 2 && s.l2 == 1, "ladder L1 L2 L1, got l1 %d l2 %d", s.l1, s.l2);
    CHECK(s.exhausted == 1, "exhausted once, got %d", s.exhausted);
    CHECK(s.oks == 0, "never ok");
}

static void first_detection_is_fast(void) {
    printf("detection and first attempt within ~1.3 s of the freeze\n");
    Sim s; sim_init(&s);
    run(&s, 3.0, true);
    double frozeAt = s.in.now;
    double firstAttemptAt = -1;
    for (int i = 0; i < 40 && firstAttemptAt < 0; i++) {
        AttoHealOutput o = sim_tick(&s, false);
        if (o.attempt == 1) firstAttemptAt = s.in.now;
    }
    CHECK(firstAttemptAt > 0 && firstAttemptAt - frozeAt <= 1.3, "first attempt %.2f s after freeze",
          firstAttemptAt - frozeAt);
    CHECK(s.lastCause == AttoHealCauseCallbacksFrozen, "cause frozen, got %d", s.lastCause);
}

static void recovers_after_first_rebuild(void) {
    printf("the first rebuild works: one attempt, result ok, attempts come back\n");
    Sim s; sim_init(&s);
    run(&s, 3.0, true);
    while (s.attempts == 0) sim_tick(&s, false);
    run(&s, 0.5, false);
    run(&s, 2.0, true);
    CHECK(s.oks == 1, "one ok, got %d", s.oks);
    CHECK(s.attempts == 1, "one attempt, got %d", s.attempts);
    /* Measured from detection: 0.5 s still frozen after the rebuild, then the first
     * advancing tick (0.25 s) with the forced session read. */
    CHECK(s.lastRecoverMs >= 500 && s.lastRecoverMs <= 1000, "recover ms %.0f", s.lastRecoverMs);
    run(&s, ATTO_HEAL_HEALTHY_RESET_SEC + 1, true);
    CHECK(s.st.attempts == 0, "attempts reset after 10 s healthy, got %d", s.st.attempts);
    /* A later, unrelated stall gets the full ladder again. */
    run(&s, 30, false);
    CHECK(s.attempts == 1 + ATTO_HEAL_MAX_ATTEMPTS, "fresh ladder, total attempts %d", s.attempts);
}

static void category_lost_while_callbacks_run(void) {
    printf("category taken while callbacks still run: heal, then ok once PlayAndRecord is back\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.categoryIsPlayAndRecord = false;
    run(&s, 1.5, true);
    CHECK(s.attempts == 1 && s.lastCause == AttoHealCauseCategoryLost, "attempts %d cause %d", s.attempts,
          s.lastCause);
    s.in.categoryIsPlayAndRecord = true; /* the L1 rebuild reasserted it */
    run(&s, 3.0, true);
    CHECK(s.oks == 1, "ok after the category is back, got %d", s.oks);
}

static void hold_interruption_and_inactive_are_never_judged(void) {
    printf("on hold, interrupted, CallKit not active, ringing: never judged\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.callLive = false; /* on hold or not connected */
    run(&s, 30, false);
    s.in.callLive = true; s.in.interrupted = true;
    run(&s, 30, false);
    s.in.interrupted = false; s.in.enabled = false;
    run(&s, 30, false);
    s.in.enabled = true;
    run(&s, 5, true);
    CHECK(s.stalls == 0 && s.attempts == 0, "stalls %d attempts %d", s.stalls, s.attempts);
}

static void grace_after_arming(void) {
    printf("frozen right after arming is CallKit settling, not a stall\n");
    Sim s; sim_init(&s);
    run(&s, ATTO_HEAL_GRACE_SEC - 0.25, false);
    CHECK(s.stalls == 0, "no stall inside the grace, got %d", s.stalls);
}

static void level2_restart_cycle_cannot_loop(void) {
    printf("L2 makes the context vanish for a moment: attempts survive, no endless loop\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    for (int i = 0; i < 400; i++) { /* 100 s */
        AttoHealOutput o = sim_tick(&s, false);
        if (o.attempt > 0 && o.level == 2) {
            const void *ctx = s.in.context;
            s.in.context = NULL;
            run(&s, 0.5, false);
            s.in.context = ctx;
            AttoHealArm(&s.st, s.in.now); /* the start hooks re-arm */
        }
    }
    CHECK(s.attempts == ATTO_HEAL_MAX_ATTEMPTS, "bounded attempts, got %d", s.attempts);
    CHECK(s.exhausted == 1, "exhausted once, got %d", s.exhausted);
    CHECK(s.disarms >= 1, "the timer stopped while the context was gone");
}

static void new_call_gets_fresh_attempts(void) {
    printf("a new call (new context) starts with fresh attempts\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    run(&s, 30, false);
    CHECK(s.exhausted == 1, "first call exhausted");
    s.in.context = &CTX_B;
    AttoHealArm(&s.st, s.in.now);
    run(&s, 2.0, true);
    run(&s, 30, false);
    CHECK(s.attempts == 2 * ATTO_HEAL_MAX_ATTEMPTS, "fresh ladder for call B, total %d", s.attempts);
}

static void long_disarm_forgets(void) {
    printf("disarmed over 30 s: the next arm forgets the old stall\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    run(&s, 30, false);
    s.in.context = NULL;
    sim_tick(&s, false);
    s.in.now += ATTO_HEAL_FORGET_SEC + 1;
    s.in.context = &CTX_A; /* same pointer reused by a new call */
    AttoHealArm(&s.st, s.in.now);
    CHECK(s.st.attempts == 0 && s.st.stallStartedAt == 0, "forgotten, attempts %d", s.st.attempts);
}

static void kill_switch(void) {
    printf("kill switch on: report the stall, never act\n");
    Sim s; sim_init(&s);
    s.in.healOff = true;
    run(&s, 2.0, true);
    run(&s, 60, false);
    CHECK(s.stalls == 1 && s.offSkips == 1 && s.attempts == 0, "stalls %d skips %d attempts %d", s.stalls,
          s.offSkips, s.attempts);
}

static void unit_missing(void) {
    printf("no audio unit during a live call\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.hasUnit = false;
    run(&s, 1.75, false);
    CHECK(s.stalls == 0, "not before 2 s, got %d", s.stalls);
    run(&s, 0.5, false);
    CHECK(s.stalls == 1 && s.lastCause == AttoHealCauseUnitMissing && s.attempts == 1, "stalls %d cause %d",
          s.stalls, s.lastCause);
}

static void flapping_is_bounded(void) {
    printf("audio that freezes and comes back every few seconds for 5 min stays bounded\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    for (int i = 0; i < 100; i++) { /* 100 cycles of 1.5 s frozen + 1.5 s fine */
        run(&s, 1.5, false);
        run(&s, 1.5, true);
    }
    /* Never 10 s healthy in a row, so the attempts never come back. */
    CHECK(s.attempts <= ATTO_HEAL_MAX_ATTEMPTS, "attempts %d", s.attempts);
}

static void no_false_recovery_after_an_action(void) {
    printf("after a rebuild, frozen callbacks never count as recovered (bug found Oct 10)\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    while (s.attempts == 0) sim_tick(&s, false);
    run(&s, 0.9, false); /* still frozen, below the 1 s threshold again */
    CHECK(s.oks == 0, "no ok without callbacks moving, got %d", s.oks);
}

static void callbacks_back_but_category_still_wrong(void) {
    printf("callbacks move again but the category is still Playback: not recovered, keep healing\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.categoryIsPlayAndRecord = false;
    run(&s, 20, true);
    CHECK(s.oks == 0, "never ok while Playback, got %d", s.oks);
    CHECK(s.attempts == ATTO_HEAL_MAX_ATTEMPTS && s.exhausted == 1, "attempts %d exhausted %d", s.attempts,
          s.exhausted);
    s.in.categoryIsPlayAndRecord = true;
    run(&s, 3, true);
    CHECK(s.oks == 1, "ok once the category is right, got %d", s.oks);
}

static void route_change_gets_a_grace(void) {
    printf("AirPods join mid call: the handoff pause is not judged (review Oct 10)\n");
    Sim s; sim_init(&s);
    run(&s, 3.0, true);
    AttoHealNoteRouteChange(&s.st, s.in.now);
    run(&s, 1.25, false); /* the engine's own route rebuild pauses the unit */
    run(&s, 2.0, true);
    CHECK(s.stalls == 0 && s.attempts == 0, "stalls %d attempts %d", s.stalls, s.attempts);
    /* A freeze that outlasts the grace is still caught. */
    AttoHealNoteRouteChange(&s.st, s.in.now);
    run(&s, 4.0, false);
    CHECK(s.stalls == 1 && s.attempts >= 1, "stalls %d attempts %d", s.stalls, s.attempts);
}

static void new_call_same_context_pointer(void) {
    printf("call B right after an exhausted call A, same context pointer: fresh attempts\n");
    Sim s; sim_init(&s);
    s.in.callToken = 111;
    run(&s, 2.0, true);
    run(&s, 30, false);
    CHECK(s.exhausted == 1, "call A exhausted");
    s.in.callToken = 222; /* new CallKit UUID, context pointer reused */
    AttoHealArm(&s.st, s.in.now);
    run(&s, 2.0, true);
    run(&s, 30, false);
    CHECK(s.attempts == 2 * ATTO_HEAL_MAX_ATTEMPTS, "fresh ladder for call B, total %d", s.attempts);
}

static void mix_recording_resets_the_counter(void) {
    printf("a mix recording resets the callback counter to 0 during recovery: still recovers\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.recCb = 50000;
    run(&s, 3.0, false);
    CHECK(s.attempts == 1, "one attempt, got %d", s.attempts);
    s.in.recCb = 0; /* startMixRecording */
    run(&s, 2.0, true);
    CHECK(s.oks == 1, "recovered after the reset, got %d", s.oks);
}

static void session_reads_limited_on_hold(void) {
    printf("on hold for 60 s the category is still read only once a second\n");
    Sim s; sim_init(&s);
    s.in.callLive = false;
    int reads = 0;
    for (int i = 0; i < 240; i++) {
        s.in.now += TICK;
        s.in.sessionChecked = AttoHealSessionCheckDue(&s.st, s.in.now);
        if (s.in.sessionChecked) reads++;
        AttoHealStep(&s.st, &s.in);
    }
    CHECK(reads >= 55 && reads <= 61, "reads %d in 60 s", reads);
}

static void counter_reset_while_frozen_is_not_recovery(void) {
    printf("mix recording resets the counter while still frozen: no false ok (second review)\n");
    Sim s; sim_init(&s);
    run(&s, 2.0, true);
    s.in.recCb = 9000;
    run(&s, 1.5, false);
    CHECK(s.attempts == 1, "one attempt, got %d", s.attempts);
    s.in.recCb = 0;
    run(&s, 0.75, false);
    CHECK(s.oks == 0, "no ok from a reset, got %d", s.oks);
}

static void wrong_category_during_grace_fixed_before_it_ends(void) {
    printf("category wrong during a route grace, fixed before it ends: no rebuild\n");
    Sim s; sim_init(&s);
    run(&s, 3.0, true);
    AttoHealNoteRouteChange(&s.st, s.in.now);
    s.in.categoryIsPlayAndRecord = false;
    run(&s, 0.75, true);
    s.in.categoryIsPlayAndRecord = true;
    run(&s, 3.0, true);
    CHECK(s.attempts == 0 && s.stalls == 0, "attempts %d stalls %d", s.attempts, s.stalls);
}

static void route_flapping_cannot_blind_forever(void) {
    printf("route changes every second with a dead unit: judged after the 5 s cap\n");
    Sim s; sim_init(&s);
    run(&s, 3.0, true);
    for (int i = 0; i < 20; i++) { /* 20 s of flapping */
        AttoHealNoteRouteChange(&s.st, s.in.now);
        run(&s, 1.0, false);
    }
    CHECK(s.stalls >= 1 && s.attempts >= 1, "stalls %d attempts %d", s.stalls, s.attempts);
}

static void session_reads_are_rate_limited(void) {
    printf("the category is read at most once a second\n");
    Sim s; sim_init(&s);
    int reads = 0;
    for (int i = 0; i < 400; i++) { /* 100 s */
        s.in.now += TICK;
        s.in.recCb += 24;
        s.in.sessionChecked = AttoHealSessionCheckDue(&s.st, s.in.now);
        if (s.in.sessionChecked) reads++;
        AttoHealStep(&s.st, &s.in);
    }
    CHECK(reads >= 95 && reads <= 101, "reads %d in 100 s", reads);
}

int main(void) {
    healthy_call_never_heals();
    larry_oct10_frozen_and_playback();
    first_detection_is_fast();
    recovers_after_first_rebuild();
    category_lost_while_callbacks_run();
    hold_interruption_and_inactive_are_never_judged();
    grace_after_arming();
    level2_restart_cycle_cannot_loop();
    new_call_gets_fresh_attempts();
    long_disarm_forgets();
    kill_switch();
    unit_missing();
    flapping_is_bounded();
    no_false_recovery_after_an_action();
    callbacks_back_but_category_still_wrong();
    route_change_gets_a_grace();
    new_call_same_context_pointer();
    mix_recording_resets_the_counter();
    session_reads_limited_on_hold();
    counter_reset_while_frozen_is_not_recovery();
    wrong_category_during_grace_fixed_before_it_ends();
    route_flapping_cannot_blind_forever();
    session_reads_are_rate_limited();
    printf("%d checks, %d failures\n", checks, failures);
    return failures == 0 ? 0 : 1;
}
