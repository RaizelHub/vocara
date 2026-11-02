# Android beta evidence matrix

Date: 2026-10-30. No usable ADB connection or physical device verification obtained.
Every row is NOT TESTED. App target 1.0.0/code 1; record actual APK version/build/hash.
For EACH run record device model, Android version/API, RAM, screen size, app version,
network, actual behavior, PASS/FAIL/NOT TESTED, and sanitized evidence. Do not turn
expected behavior into an observed result. No device is assumed available.

Prioritize owner's actual phone, then an available low-memory (2–3 GB) small phone
and a recent large-screen phone. Proposed coverage: Android 7/API24 minimum candidate
(confirm APK minSdk), Android 10–12, Android 13–16. Record unavailable combinations.
Repeat network scenarios on Wi-Fi and mobile data. Do not buy devices for this task.

| ID | Scenario / steps | Expected | Actual / status / evidence |
|---|---|---|---|
| A01 | Install trusted preview APK; disconnect PC, stop Metro; cold start | Vocara name/icon; independent launch | NOT TESTED |
| A02 | Register synthetic user; confirm email; login/logout; recovery link | Correct deep links and session isolation | NOT TESTED |
| A03 | Start free five-question interview; record and submit each; finish | Five saved answers, feedback/history; no midway quota stop | NOT TESTED |
| A04 | Exhaust synthetic allowance; start again | Clear refusal; no partial session | NOT TESTED |
| A05 | Start simultaneously on two signed-in devices | Atomic allowance; no over-admission | NOT TESTED |
| A06 | Fail Quick Practice initialization using disconnected network; reconnect/retry repeatedly | One session; navigation and loading recover | NOT TESTED |
| A07 | First recording permission allow; then deny on clean synthetic install | Recording works or permission UI; no crash | NOT TESTED |
| A08 | Permanently deny microphone; use Settings; reopen | Settings action and permission recheck | NOT TESTED |
| A09 | Revoke microphone in Settings during active session | Safe failure; saved answers preserved | NOT TESTED |
| A10 | Background/switch apps while recording; incoming phone call | Recorder stops safely; no hidden background capture | NOT TESTED |
| A11 | Cut network during upload; reconnect, double-tap retry | No false success; one verified attachment | NOT TESTED |
| A12 | Cut network during transcription / evaluation separately | Resume saved state; no immediate duplicate dispatch | NOT TESTED |
| A13 | Force-stop after saved answer; reopen, Resume Interview | Correct question/feedback; no additional reservation | NOT TESTED |
| A14 | Android process termination before upload | Prior saved answers intact; unsent recording not promised recoverable | NOT TESTED |
| A15 | Interrupt finalization; reopen | Processing/retry state; no false completion | NOT TESTED |
| A16 | Timeout/429/invalid AI fixture on disposable backend | Clear error/cooldown; bounded explicit retry | NOT TESTED |
| A17 | Optional Test Store failure/cancel; free interview afterward | No real billing; free path remains usable | NOT TESTED |
| A18 | Privacy/Terms/deletion, synthetic user only, owner-supervised worker | Recent auth; pending honest; Storage then Auth erasure | NOT TESTED |
| A19 | Offline cold start then reconnect; expired auth | Understandable failure/retry; no cross-user cached data | NOT TESTED |
| A20 | Small screen/large font/dark mode; low RAM long session | Usable controls; record measured delays/crashes | NOT TESTED |
| A21 | Update signed APK over beta; resume saved interview | Same account/history; correct new version | NOT TESTED |
| A22 | Inspect final manifest/signature/minSdk and bundled assets | No debug/overlay/broad storage permission or private secrets | NOT TESTED |

Use fixture responses for fault injection; do not deliberately spend Groq quota.
Any live complete-interview test requires owner-approved staging access and cost.
