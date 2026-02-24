# Request Language Support via GitHub Issue

## Summary

Add a subtle link below the language selection list in Language Settings that opens a pre-filled GitHub issue for users to request support for a new language.

## Approach

URL-based GitHub issue link using `<a>` tag with `target="_blank"` (matching existing About tab patterns). No backend work or API integration needed.

## UI

- Placement: Below the language radio button list, inside the existing language settings card
- Style: Muted secondary link with hover effect, not a prominent button
- Icon: Plus or external link icon alongside the text
- Text: "Don't see your language? Request it on GitHub" (localized)

## GitHub Issue URL

```
https://github.com/octasoft-ltd/wsl-ui/issues/new?title=Language+Request:+[Language+Name]&body=...&labels=enhancement
```

Pre-filled body template:

```
**Language requested:** [Please specify the language]
**Language code (if known):** [e.g., it, nl, ru]

I'd like to request support for this language in WSL UI.
```

## i18n

Add `language.requestLanguage` and `language.requestLanguageDesc` keys to the `settings` namespace in all supported locales.

## Files to modify

- `src/components/settings/LanguageSettings.tsx` - Add the link below the language list
- `src/i18n/locales/en/settings.json` - Add English translation keys
- `src/i18n/locales/{other}/settings.json` - Add translated keys for all other locales
