# Supported Schools and Platforms

The support level describes **evidence**, not ambition. No school is `Verified` in v0.5.0-rc.1.

## Wuhan University of Technology (WHUT)

- **Platform**: Wisedu jwapp / `wdkbby` student timetable variant
- **Entry**: `https://jwxt.whut.edu.cn/jwapp/sys/homeapp/index.do?forceCas=1`
- **Adapter**: `whut-wisedu-jwapp`
- **Methods**: read-only API using the user’s already-authenticated browser session
- **Status**: **Experimental**
- **Automated evidence**:
  - Wisedu response fields;
  - `SKZC` bitmap weeks;
  - WHUT DM-to-physical section mapping;
  - stable course/meeting IDs;
  - Playwright runtime injection;
  - Qt GUI independent browser lifecycle.
- **Outstanding**:
  - student-account login and live timetable comparison;
  - official school calendar and adjustment data completeness;
  - final support-level upgrade to `Verified`.

The login page itself was checked to redirect to WHUT unified authentication. No test account credentials were available to the agent, and no bypass was attempted.

## Zhengfang

Zhengfang V8/V9-style API and DOM fallbacks are implemented as `zf-jwglxt`. Tested with a fictional `kbList` fixture. No real school is certified.

## Qiangzhi

Rendered timetable DOM parsing is implemented as `qiangzhi-dom`. Tested with a public grid fixture. No real school is certified.

## Qingguo

List/grid DOM parsing is implemented as `qingguo-dom`; the existing file parser remains available for official HTML exports. No real school is certified.

## Generic

`generic-dom` can attempt a rendered HTML timetable only after explicit user action. It is intentionally low-confidence and cannot claim adjustment completeness.

## What “no real school certification” means

- Connector code compiles and fixture tests pass.
- UI/Playwright lifecycle and package builds pass.
- But no account-authenticated end-to-end extraction from a live school server has been verified in this environment.
- Do not describe `Experimental` as production-compatible with every deployment of that vendor.
