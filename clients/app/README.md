# Account client

Use `@app/` for modules owned by `clients/app/src`. Temporary dependencies on
`clients/web/src` use `@web/` so their ownership is visible at each import site.
Neither alias falls back into the other client.

The bare `@/` alias resolves only web source for web's internal imports. App
source must not use it.

The client currently still composes web's assistant routes and uses web's build
configuration, assets, API generation, and test preload. Subsequent changes will
give app its own account auth, i18n, and tooling, and load versioned assistant UI
through an iframe rather than including it in the account bundle.
