# Login resilience — mock fallback & API outages

## Корни

1. **Путаница с mock:** при `Failed to fetch` на `/auth/config` шапка ставила `steamLoginAvailable=false` и вела «Войти» на `/login?dev=1` (QA mock).
2. **Каталог / вход:** тот же обрыв сети без retry и без кнопки «Повторить»; Steam-кнопка молча глотала ошибку.

Клиентский `Failed to fetch` (VPN, DNS, блокировщик, другой профиль Chrome) сервер «починить» не может — можно убрать ложный UX и смягчить краткие сбои.

## Продуктовое решение

| Слой | Поведение |
|------|-----------|
| **UserMenu** | Гость всегда видит **Steam** CTA. Никогда не ссылка на `/login?dev=1`. Mock — только явный URL для QA. |
| **apiRequest** | GET: до 2 повторов при network / 502–504 с backoff. |
| **auth config** | Кэш в sessionStorage (10 мин); при полном фейле — soft-degrade на кэш. |
| **SteamLoginButton** | При ошибке API — текст + «Повторить вход», не mock. |
| **Каталог** | Кнопка «Повторить» рядом с ErrorAlert. |
| **Steam callback actions** | Ссылки на `/`, не на `/login`. |

## Проверка

1. Задеплоить frontend на staging.
2. Гость: «Войти» = Steam (иконка), URL не `/login?dev=1`.
3. DevTools → Offline → «Войти» → сообщение о сети, кнопка retry; mock-страница не открывается.
4. Каталог offline → ErrorAlert + «Повторить».
5. QA: `/login?dev=1` по-прежнему открывает mock (если backend разрешает).
