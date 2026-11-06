# Connector SDK

The SDK is implemented in `src/connectors/` and bundled both into the MV3 extension and into `python/terics/assets/connector-runtime.js` for Python Playwright injection.

URL-first routing uses a separate Resolver layer:

```text
URL validator -> School Registry -> Connector Registry -> adapter detection
```

Resolver output is *identification evidence*, not proof of successful extraction. WHUT's dedicated adapter is selected before any generic Wisedu fallback.

## Interfaces

```ts
interface SISAdapter {
  descriptor: ConnectorDescriptor;
  detect(context: ConnectorContext): Promise<DetectionResult>;
  extract(
    context: ConnectorContext,
    semester: SemesterSelection
  ): Promise<ConnectorExtraction>;
  validate(timetable: NormalizedTimetableV2): ValidationReport;
}
```

`ConnectorContext` contains only:

- current URL;
- current `Document`;
- page `fetch`;
- current clock.

It never contains a password, cookie database, access token or persisted CSRF value.

## Lifecycle

1. User opens the extension popup or clicks “从浏览器提取” in the desktop app.
2. An injected runtime runs on the current tab.
3. Registry runs adapter detection in priority order.
4. The highest-confidence adapter performs the extraction.
5. Extraction is normalized into schema 2.0.
6. Structural validation produces a `ValidationReport`.
7. The result is passed to the preview UI as a local JSON message.

No adapter runs in the background or watches pages.

## Course and meeting identity

- School-provided course code / teaching-class identity is preferred.
- Meeting identity prefers the source row IDs and schedule structure.
- If a source has no stable ID, `sourceRef` plus deterministic ordinal is hashed.
- Event UID is generated from term ID, course ID, meeting ID, date and section range only.
- Changing a display title, teacher name or room does not create a new event identity.

## Capability declaration

- `timetable`
- `semester`
- `periods`
- `classroom`
- `adjustments`
- `exams`

A capability is declared only when an implementation path exists. Extraction metadata separately records whether adjustment data was actually present.

## Validation

The normalized output includes:

- schema version;
- stable source/adapter metadata;
- term context;
- courses and meetings;
- schedule overrides;
- extraction metadata;
- validation checks and completeness counters;
- non-fatal warnings.

The exchange JSON rejects credential-like fields recursively.

Schema validation also runs on opaque extension handoffs before Web preview. A malformed or tampered payload is rejected without consuming the one-time handoff.

## Adding an adapter

See [adapter-development.md](adapter-development.md).
