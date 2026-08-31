# QA — Extension context invalidated 0.6.43

## Проблема

После Reload / Load unpacked на уже открытой вкладке инвентаря Steam в Errors:

`Uncaught (in promise) Error: Extension context invalidated.`

Стек: `getTwoMinuteOnboardingState` → `chrome.storage.local.get`.

Орфанный content script ещё жив; `chrome.*` уже мёртв. Host bar уже частично защищал session/onboarding, но two-minute storage вызывался без обёртки.

## Фикс

- `getTwoMinuteOnboardingState` / `setTwoMinuteOnboardingState` через `withExtensionContext` → default / no-op вместо throw.
- `renderHostBar` не читает two-minute storage, если контекст уже помечен invalidated.
- Fire-and-forget `recordTwoMinute*` / dismiss с `.catch`.

## Проверка

1. Load **0.6.43**, открыть инвентарь Steam — overlay/host bar ок.
2. Reload расширения на `chrome://extensions`, **не** обновляя вкладку Steam — в Errors не должно копиться `Extension context invalidated` от two-minute (баннер reload / soft degrade ок).
3. Hard refresh вкладки — свежий script, всё нормально.
