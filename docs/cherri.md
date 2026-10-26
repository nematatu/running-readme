# Cherri shortcut

[shortcuts/upload-running-readme.cherri](../shortcuts/upload-running-readme.cherri) describes the complete phone workflow. It queries Actions workouts without a record limit, repeats over the results, keeps Running records, builds four-line text blocks, combines them, reads the token from Actions Keychain, and posts one JSON field to `/v1/workouts`. The API computes annual totals and the latest five runs. No token value is embedded in the source.

The existing shortcut shared by the owner supplied the actual Actions query descriptor, Workout property metadata, and native `running` enum condition. The build script copies those definitions into Cherri's output. It does not copy the original shortcut's note reference, manual selection, workout results, or other actions.

## What is verified

- Cherri 2.3.0 compiles the source. Assertions inspect the resulting action graph, all-record query, repeat references, native Running predicate, exact property metadata bytes, date formats, guards, Keychain reference, JSON body, Bearer header, and success comparison.
- Seven deliberate corruptions were rejected locally, covering a query limit, a Walking predicate, missing property metadata, the wrong Keychain key, the wrong endpoint, a reversed success comparison, and a missing repeat end.
- Native macOS signing succeeded with `people-who-know-me`; the output starts with `AEA1`. The private signed file is excluded from Git. This establishes successful signing, not successful iPhone execution.
- Signing with `anyone` failed with `Error: Failed to modify some records`. Its cause remains unknown. No external signing service was used.
- **Unverified:** iPhone import, Actions property formatting and Keychain resolution on the device, Health access, API submission from the shortcut, and unattended automation. The checks do not run the shortcut or upload workout data.

## Use the generated file on this Mac

The owner-specific signed artifact is at `artifacts/cherri/Upload Running README.shortcut` in the local checkout. It is not a public release asset. Apple's [sharing guide](https://support.apple.com/en-euro/guide/shortcuts/apdf01f8c054/ios) says the private sharing mode includes contact information. Do not publish that file.

1. In Finder, open the checkout's `artifacts/cherri` folder. Send **Upload Running README.shortcut** to your iPhone using AirDrop.
2. Open the received file in Shortcuts and inspect it before adding it. Import on this device has not been tested. If import fails, retain the existing shortcut and report the exact error; do not rename an unsigned plist to work around it.
3. Set up Actions Keychain key **running-readme.ingest-token** using the token in local `.secrets/ingest-token.txt`. Follow the [token setup instructions](ios-text-upload.md). The file and directory have restricted permissions. Keep the value out of shared shortcuts, notes, screenshots, and Git.
4. Keep the iPhone time zone at Tokyo. The shortcut stops unless the current formatted UTC offset is `+09:00`; it formats workout dates as `yyyy/MM/dd HH:mm:ss`, which the API interprets as Tokyo time. This guard does not convert historical dates from a different device time zone.
5. Check Health for duplicate Running records from different apps. The generated query reads all sources; it does not choose Mi Fitness automatically. The API counts identical normalized start-date/distance/duration fingerprints once, but cannot identify two differing records of the same exercise. Distinct real runs with identical fingerprints are also merged. Do not sync an unreviewed mixture of sources.
6. Run manually while unlocked. Allow Actions to read workouts, allow the API request, and check the returned response. A successful accepted response has `ok: true`. A network or permission error can stop Shortcuts before a custom notification appears.
7. Open [annual JSON](https://running-readme-api.amtt.workers.dev/v1/stats) and [recent runs](https://running-readme-api.amtt.workers.dev/v1/workouts). Compare them with Health. KV can take 60 seconds or more to reflect a write across locations.
8. After manual verification, follow the [22:00 automation instructions](ios-text-upload.md). Device locking, Health permission, connectivity, and iOS execution restrictions still apply.

Empty text is not sent. An upload without Running records for the current Tokyo year is rejected by the API. A successful request replaces the whole year's value; do not add a 15-item limit or send only a selected run.

## Build from source

Install [official Cherri](https://cherrilang.org/install.html), version 2.3.0. The development check used the official macOS arm64 asset; its SHA-256 matched GitHub's published asset digest `15e4651d4c957a03cdfeb6c5fd74ea8ac66f1d6e20897883fef3547fdd36d264`.

The metadata input is an **unsigned property list** from the owner's working iCloud shortcut, saved privately at `.audit/cherri-import/original.plist` in this checkout. It is intentionally not committed. Rebuilding another installation requires its own compatible export with Find Workout, all four referenced properties, and a native Running condition. A signed local shortcut cannot be substituted; see [Cherri's import documentation](https://cherrilang.org/decompilation.html). Do not use a reference containing embedded credentials or Health results.

```sh
CHERRI_BIN=/path/to/cherri python3 scripts/check-cherri.py .audit/cherri-import/original.plist
shortcuts sign --mode people-who-know-me \
  --input 'artifacts/cherri/Upload Running README_unsigned.shortcut' \
  --output 'artifacts/cherri/Upload Running README.shortcut'
```

The first command compiles a temporary source copy with `--skip-sign`, restores the exported metadata and native enum predicate, validates the graph, and writes a private XML plist. The second uses [Apple's native signing command](https://support.apple.com/en-hk/guide/shortcuts-mac/-apd455c82f02/mac). Neither command runs the workflow. Successful signing may still require device-side import troubleshooting.

**Do not compile and sign the `.cherri` file directly.** The observed Cherri 2.3.0 output omits required exported property metadata; the build script supplies it. Do not add `--derive-uuids`: in the observed compiler output, it reused a grouping identifier across distinct conditionals. Default UUID generation passed the uniqueness check. Cherri's automatic signing fallback is also bypassed so the private definition is not sent to an external signer.

The source sends only Workout Type, Date, Duration, and Distance. Duration and distance are converted to text by Shortcuts, as in the owner's working memo. Device output still needs verification: unsupported units or formatting are rejected by the API rather than guessed. There is no on-device annual-window dictionary, date parsing, or summation step.
