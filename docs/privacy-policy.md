# ScamShield Extension — Privacy Policy

_Last updated: September 2026_

## What this extension does

ScamShield Scanner lets you check selected text, or the current page's links,
for scam patterns without leaving the page you're on.

## What data is collected

**Text you explicitly submit.** When you right-click selected text and choose
"Check with ScamShield," paste text into the extension popup, or click a
flagged link badge, that text is sent to the ScamShield API
(`scamshield-9ksh.onrender.com`) to be scored. Nothing else on the page is
sent — the extension does not read, collect, or transmit page content beyond
the specific text you act on.

**Link scanning is local.** The "Scan this page for suspicious links" feature
checks link URLs against a pattern list entirely inside your browser. No page
content is sent anywhere for this feature; a network request is only made if
you click a flagged badge to get a full check.

**Nothing is sold or shared with third parties.** Text you submit for
checking is processed by the ScamShield API to return a risk score and is
not stored beyond what is needed to serve that response, not linked to your
identity, and not shared with advertisers or data brokers.

## Third-party services

The extension calls two services to do its job:

- **ScamShield API** (hosted on Render) — scores the text you submit.
- **Google Gemini** — powers the optional chat assistant in the full web
  dashboard (not used by the extension itself).

## Permissions this extension requests, and why

| Permission | Why |
|---|---|
| `contextMenus` | Adds the "Check with ScamShield" right-click option. |
| `activeTab` | Lets the extension read the current tab only when you invoke it — not on every page you visit. |
| `scripting` | Injects the link-scanning script only when you click "Scan this page," not automatically. |
| `storage` | Stores your most recent check result locally so the popup can show it. |
| Host access to `scamshield-9ksh.onrender.com` | The only server the extension talks to. |

The extension does not request access to all websites by default. It only
acts on a page when you explicitly ask it to.

## Your choices

- Uninstalling the extension removes all locally stored data immediately.
- No account or sign-up is required or collected.

## Contact

Questions about this policy: open an issue at
https://github.com/Mnvv08/scamshield/issues
