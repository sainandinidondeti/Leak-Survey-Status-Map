# Leak Survey Status Map

A small web app that draws gas pipeline segments for the fictional town of Maple Falls on an interactive map and colours each one by its leak survey status under **49 CFR §192.723(b)(1) and (b)(2)**.

## Technologies
HTML, CSS, vanilla JavaScript, [Leaflet 1.9.4](https://leafletjs.com/) (loaded from cdnjs), OpenStreetMap tiles, GeoJSON. No build step, no frameworks, no paid APIs. Tests use plain Node.js (no installs).

## Folder structure
```
serve.py                      Local web server (no caching)
build_standalone.py           Builds the single-file standalone HTML
index.html                    Page layout
style.css                     Styling (responsive, light/dark)
config.json                   Survey intervals, amber window, colours, labels  <- change rules here
maple_falls_segments.geojson  Input data (unchanged)
js/surveyDates.js             Date parsing, month arithmetic, next-due calculation
js/geometry.js                Geometry validation + business-district classification
js/status.js                  Builds records from GeoJSON; works out status
js/csv.js                     CSV export of overdue pipelines
js/map.js                     Leaflet map drawing only
js/app.js                     Dashboard UI: loading, state, filters, lists
tests/run-tests.js            Automated tests (dates, geometry, full dataset, CSV)
```

## Easiest way: the standalone file
`leak-survey-status-map-standalone.html` is the whole app in one file. Just double-click it (internet needed for the map). It is generated from the project files with `python3 build_standalone.py`, so re-run that after editing anything.

**Map tiles note:** OpenStreetMap blocks tile requests that carry no Referer, which is the case for pages opened by double-click (`file://`). In that mode the app uses CARTO tiles (OpenStreetMap data); with `python3 serve.py` it uses OpenStreetMap tiles directly, which is the recommended way.

## Run locally with a server (macOS)
The browser blocks `fetch()` of local files when you double-click `index.html`, so use a tiny local server.
1. Open **Terminal**. Type `cd ` (with a space), drag the project folder into the window, press Enter.
2. Run `python3 serve.py` (Python 3 is preinstalled on recent macOS). It prints the folder and build it serves. (`python3 -m http.server 8000` also works, but browsers may cache old files.)
3. Open the URL it prints (<http://localhost:8080>) in your browser. You need internet for the map tiles and Leaflet.
4. Set the **As of date** to `15 Nov 2026` to see the evaluation scenario. Stop the server with `Ctrl+C`.

## If the page looks out of date
The header shows a build number (currently 8). If it is missing or old, your browser cached old files: stop the server, make sure it runs in the newest folder, and hard-refresh with Cmd+Shift+R.

## Tests
Two commands (need Node.js; no `npm install`):
- `node tests/run-tests.js`: 40 tests.
- `node tests/check-wiring.js`: checks that every element id, script file and `Module.method()` call in the code really exists, so a leftover call to a deleted function is caught before the app is run.

The first command It checks date maths, both regulations, geometry cases, all 10 records at as-of 2026-11-15, date changes, and CSV output.

Expected results at **15 Nov 2026** (hand-calculated from the rule text, then asserted in the tests):

| ID | Area | Last survey | Next due | Status |
|----|------|-------------|----------|--------|
| S01 | Business | 2025-01-15 | 2026-04-15 | Overdue |
| S02 | Business | 2025-12-10 | 2026-12-31 | Due soon (46 days) |
| S03 | Business | 2026-06-01 | 2027-09-01 | OK |
| S04 | Outside | 2022-03-01 | 2027-06-01 | OK |
| S05 | Outside | 2021-01-20 | 2026-04-20 | Overdue |
| S06 | Outside | 2021-09-10 | 2026-12-10 | Due soon (25 days) |
| S07 | Business (crosses boundary) | 2025-08-20 | 2026-11-20 | Due soon (5 days) |
| S08 | Outside | missing | – | Unknown |
| S09 | Unknown (bad geometry) | 2025-05-05 | – | Unknown |
| S10 | Business | 2026-01-31 | 2027-04-30 | OK |

Totals: 10 records, 3 OK, 3 due soon, 2 overdue, 2 unknown; 9 drawn on the map.

## How due dates are calculated
Rule text: business district = "at intervals not exceeding **15 months**, but at least once each **calendar year**"; outside = "at least once every **5 calendar years** at intervals not exceeding **63 months**".
Both conditions apply at once, so **next due = the earlier of**:
1. last survey + N months (15 or 63), and
2. 31 December of (last survey year + 1 for business, + 5 for outside).

Examples: business, surveyed 10 Dec 2025 → 15 months is 10 Mar 2027 but the calendar-year limit is 31 Dec 2026, so due **31 Dec 2026**. Business, surveyed 15 Jan 2025 → 15 months (15 Apr 2026) is earlier than 31 Dec 2026, so due **15 Apr 2026**.
Month addition clamps to month-end (31 Jan + 15 months = 30 Apr). Dates are handled as plain calendar dates in UTC, so time zones never shift them.

**Status** (against the As-of date): *Overdue* if as-of is after the due date (the due date itself is still OK); *Amber* if due within 0–60 days inclusive; *OK* otherwise; *Unknown* if the data is insufficient. All numbers live in `config.json`.

## Business district classification
The polygon feature (`zone: BUSINESS_DISTRICT`) is read from the GeoJSON. A line is "business district" if it has **any** non-zero intersection with the polygon: fully inside, crossing, or touching the boundary (point-in-polygon plus segment-intersection tests). Everything else is "outside".

## Unusual records
- **S07** crosses the boundary → classified business district (stricter rule, 15 months). Flagged in the popup and Data Issues panel.
- **S08** last survey date missing → status Unknown, no date invented. It is drawn (geometry is fine) and classified outside.
- **S09** LineString has one coordinate → invalid, not drawn, not classified, status Unknown. Still counted in the totals and listed under Data Issues.
- Invalid dates (e.g. 2025-02-30), non-LineString geometry or features without an ID are reported rather than dropped or crashing the app.

## Decision log
| # | Unclear point | Decision | Reason |
|---|---------------|----------|--------|
| 1 | Do the 15-month and calendar-year rules combine or is one chosen? | Combine: due = earlier of the two | The rule says both "not exceeding 15 months" and "at least once each calendar year"; meeting only one can still be a violation. |
| 2 | Meaning of "once every 5 calendar years" | Next survey must occur by 31 Dec of (last year + 5), in addition to the 63-month limit | Mirrors the business-district reading (once each calendar year → by end of next year). Reasoning: "at least once each calendar year" means every calendar year must contain a survey (survey in 2025 → next in 2026). Generalised, "once every 5 calendar years" means every window of 5 consecutive calendar years contains a survey (survey in 2021 → next by end of 2026). A stricter reading (by end of year+4) would make the N=1 business-district case "same year", which is not what the rule says. For this data the 63-month limit decides S04, S05 and S06 anyway. |
| 3 | Month arithmetic at month ends | Clamp to last day of month | Avoids invalid dates; also never later than the true month-based limit. |
| 4 | Is the due date itself overdue? | No; overdue starts the day after | "Not exceeding" means the due date is the last compliant day. |
| 5 | Is "within 60 days" inclusive? | Yes, 0 to 60 days before due | Simple, documented; configurable. |
| 6 | S07 crosses the district | Business district | Conservative compliance choice from the brief. |
| 7 | Line only touching the boundary | Business district | Same "any non-zero intersection" rule; intersection tests treat touching as intersecting. |
| 8 | S08 missing date | Unknown | Inventing a date could hide a missed survey. |
| 9 | S09 invalid geometry | Unknown, not drawn, still counted | Cannot classify without geometry; it must not disappear silently. |
| 10 | Does the status filter affect the overdue list? | No: filter affects the map only; the list always shows overdue | The list is a compliance report; cards and legend also show all-record counts. |
| 11 | Last survey after the As-of date | Calculate normally and add a warning | Plausible when looking back in time; the user should be told. |
| 12 | "Today" default | Browser's local date | Matches what the user sees on their calendar. |
| 13 | CSV cells beginning `= + - @` | Prefixed with `'` | Prevents spreadsheet formula injection from data values. |
| 14 | Regulation amendments | Used the two clauses named in the task; I did not apply other parts of §192.723 or newer PHMSA leak-detection rule changes | Task says to ignore everything else. The text was cross-checked against several public copies of the CFR (Cornell LII, FindLaw, PHMSA documents). |

## Known limitations
- Needs internet for Leaflet and OSM tiles (not bundled).
- Planar maths on lon/lat is fine at town scale but not for huge areas.
- Only Polygon/MultiPolygon district and LineString pipelines are supported.
- Automated tests cover the logic in Node. The UI was smoke-tested in headless Chromium with a *stubbed* Leaflet (the build environment had no internet); **please open it once with real Leaflet and tiles and check the map visually.**
- Real-world rules have extra cases (e.g. unprotected steel, risk-based programs) that are out of scope.

## AI usage
**Tool used:** Claude (Anthropic), in the claude.ai chat. Claude wrote the first version of all the code (`js/` modules, HTML, CSS), the tests in `tests/run-tests.js`, `serve.py`, `build_standalone.py` and a draft of this README. I ran the app on my MacBook, checked the results against the regulation text myself, and sent screenshots back to get problems fixed.

**Mistakes the AI made that were caught and fixed:**
1. **Wrong test expectations.** The first test run had 2 failures, and both were mistakes in the AI's tests, not in the app: it expected S08's area to be "unknown" (it is correctly "outside"; only its date is missing), and it put the amber boundary one day off (31 Oct is 61 days before 31 Dec, so it is still green; 1 Nov is the first amber day). Fixed by re-deriving the expected values by hand from the rule.
2. **Map code that crashed on real Leaflet.** `fitAll()` passed a layer group to `L.featureGroup(...)`, which throws an error in real Leaflet. The AI's own browser test used a fake Leaflet that hid it. My screenshot showed the Overdue list and Data issues panels empty, which exposed it. Fixed by computing the bounds from each line, and the test stand-in was made stricter.
3. **Hardcoded "60 days".** The AI left "60 days" typed into the HTML legend and filter, which breaks the rule that the amber period lives only in `config.json`. Fixed: those labels are now built from `amberWarningDays`.
4. **Wrong claim that double-clicking `index.html` would work.** OpenStreetMap returns "403 Access blocked" for pages opened from `file://` because no Referer is sent, which my screenshot showed. Fixed: the app uses a fallback tile layer in that case, and the README recommends `python3 serve.py`.
5. **Half-finished feature left in the code.** After a label-hiding idea was dropped, the AI deleted the function but left a call to it in `app.js` (its search for leftovers was case-sensitive), so a red "scheduleDeclutter is not a function" box appeared in my browser. It was removed, and `tests/check-wiring.js` was added so this kind of mismatch is caught automatically.

**What I verified myself:** the regulation wording (49 CFR §192.723(b)(1) and (b)(2)), each due date for S01-S10 by hand, and that the on-screen counts (10 / 3 / 3 / 2 / 2) match.
