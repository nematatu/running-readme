# Cherri source for the text sender

[shortcuts/upload-running-readme.cherri](../shortcuts/upload-running-readme.cherri) implements the **upload half** of the workflow. It takes the complete workout memo as Shortcut Input, reads Actions Keychain key `running-readme.ingest-token`, posts one JSON text field to the deployed API, checks `ok`, and returns the response text. No token value is in the source.

It does **not** implement Actions Find Workout, all-record selection, property extraction, or text combining. Those must currently come from the existing iPhone shortcut. Do not run it with only a selected run or a 15-record subset; an accepted request replaces annual totals.

## Verified and unverified

- Verified: Cherri 2.3.0 syntax compilation and the actual generated plist's input guard, separate conditional groups, guard inputs/comparisons/stop paths, Keychain key reference, JSON field, endpoint, method, and Bearer token reference. No Health, Keychain, or network action was executed by these checks.
- Unverified: iPhone import, Actions Keychain resolution at runtime, and a complete source-to-Health-to-API run. The Keychain definition uses the Actions bundle/intent identifiers and parameter metadata; a successful compile alone does not establish that Shortcuts resolves it on the user's device.
- Blocked: macOS native signing returned `Error: Failed to modify some records` in two attempts. The underlying cause is unknown. No signed download is offered, and the unsigned plist is not presented as an importable shortcut.

## Compile and inspect

Install [official Cherri](https://cherrilang.org/install.html). The development check used the official `v2.3.0` macOS arm64 asset, whose SHA-256 matched GitHub's asset digest `15e4651d4c957a03cdfeb6c5fd74ea8ac66f1d6e20897883fef3547fdd36d264`.

```sh
python3 scripts/check-cherri.py
# Or select a local compiler explicitly:
CHERRI_BIN=/path/to/cherri python3 scripts/check-cherri.py
```

The script uses a temporary source copy and `--skip-sign`, validates the real generated graph, and saves an inspection plist under ignored `artifacts/cherri/`. It never imports or runs the shortcut, loads the ingestion token, or contacts the service. The compiler's v2.3.0 unsigned output is named from `#define name` beside the source copy; `--output` does not relocate that unsigned intermediate.

To compile and sign once the native signing issue is resolved:

```sh
cherri shortcuts/upload-running-readme.cherri --share=anyone
```

Do not add `--derive-uuids` to this version's verification command. In the observed output it reused a grouping identifier across distinct conditionals. The default random IDs passed the graph-uniqueness check. A separate local mutation check reversed the success comparison and confirmed that the validator rejected it. Generated `.shortcut`, `.plist`, and processed source files are ignored by Git.

## Complete the Health portion from a real export

The [Cherri action-definition guide](https://cherrilang.org/language/action-definitions) says to obtain unsupported action identifiers/parameters from an actual shortcut. Actions publishes the Workout query and property types, but not enough information to reconstruct its iOS query-filter and property-reference serialization from screenshots.

Provide the existing working shortcut's **iCloud sharing link**, preferably including Find Workout, one Workout property reference, and Keychain: Get with only the key name. The runtime token value and actual Health results are not needed. Do not embed credentials or saved Health records into the shared definition.

Cherri's [import documentation](https://cherrilang.org/decompilation.html) recommends an iCloud link and currently does not support decompiling a locally signed shortcut file. An exported local file may therefore be insufficient. [Apple's sharing guide](https://support.apple.com/ja-jp/guide/shortcuts/apdf01f8c054/ios) describes copying the iCloud link. This is an evidence dependency, not a requirement to reconstruct the whole shortcut manually.

Once the real action definitions are available, the exporter can be written in Cherri and combined with this sender. No placeholder Find Workout action is shipped as if it worked.
