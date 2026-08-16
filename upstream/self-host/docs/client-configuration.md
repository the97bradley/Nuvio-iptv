# Connect Nuvio apps

## Discovery

Self-hosted Nuvio servers publish their client settings at:

```text
<BACKEND_URL>/.well-known/nuvio
```

Supported clients use the Backend URL to request this document. It contains
the backend URL, publishable key, and available features:

```json
{
  "version": 1,
  "service": "nuvio",
  "self_hosted": true,
  "backend_url": "https://backend.example.com",
  "publishable_key": "<PUBLIC_CLIENT_KEY>",
  "capabilities": {
    "email_password_auth": true,
    "tv_login": true
  }
}
```

The publishable key is public client configuration. The response does not
include service-role keys, Supabase secret keys, database passwords, or
dashboard credentials.

## Manual build configuration

To store connection settings in a client build, add the deployment's Backend
URL and publishable key to the source project before building Nuvio TV, Mobile,
Desktop, Web, Tizen, or webOS. The build embeds both values, so changing either
one requires a rebuild and reinstall.

Run this command from the Nuvio Self-Host directory to print the required build
values:

```sh
./nuvio credentials
```

Copy the printed `<BACKEND_URL>` and `<PUBLISHABLE_KEY>` values into the client
properties or build environment variables shown below. For a phone, TV, or
other physical device, use the public HTTPS address in
`https://backend.example.com` form. Use the publishable key in apps, and keep
service-role keys, Supabase secret keys, database passwords, and Studio
passwords on the server.

The public avatar bucket URL is:

```text
<BACKEND_URL>/storage/v1/object/public/avatars
```

## Choose your app

| Client source | Build configuration |
| --- | --- |
| `NuvioMedia/NuvioTV` | Root `local.properties` |
| `NuvioMedia/NuvioMobile` | Root `local.properties` or build environment variables |
| `NuvioMedia/NuvioDesktop` | Root `local.properties` or build environment variables |
| `NuvioMedia/NuvioWeb` | Root `local.properties`; included in Web, Tizen, and webOS builds |

## Android TV

In the `NuvioTV` project, add these values to the root `local.properties` file:

```properties
SELF_HOSTED=true
NUVIO_SUPABASE_URL=<BACKEND_URL>
NUVIO_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
NUVIO_SUPABASE_FALLBACK_URL=
AVATAR_PUBLIC_BASE_URL=<BACKEND_URL>/storage/v1/object/public/avatars
```

For a debug APK, copy the same settings to `local.dev.properties`. Debug builds
read that file before `local.properties`, so both files should point to the
same backend.

`SELF_HOSTED=true` enables direct email and password sign-in in the TV build.
Self-hosted mode uses the Backend URL and publishable key shown above.

Rebuild the client after changing the file:

```sh
./gradlew :app:assembleFullDebug
```

## Mobile

In the `NuvioMobile` project, create or update the root `local.properties`
file:

```properties
NUVIO_SUPABASE_URL=<BACKEND_URL>
NUVIO_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
NUVIO_SUPABASE_FALLBACK_URL=
```

These values configure both Android and iOS. You can set variables with the
same names in the build environment, but a non-empty `local.properties` value
takes priority. The app derives avatar URLs from `NUVIO_SUPABASE_URL`.

Rebuild the Android or iOS app after changing the values.

## Desktop

In the `NuvioDesktop` project, create or update the root `local.properties`
file:

```properties
NUVIO_SUPABASE_URL=<BACKEND_URL>
NUVIO_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
NUVIO_SUPABASE_FALLBACK_URL=
```

You can also set the same names as build environment variables. A non-empty
value in `local.properties` takes priority. The app derives avatar URLs from
`NUVIO_SUPABASE_URL`.

Rebuild the desktop app after changing the values:

```sh
./gradlew :composeApp:packageReleaseDistributionForCurrentOS
```

## Web, Tizen, and webOS

The `NuvioWeb` project contains the browser app and the packaged Samsung Tizen
and LG webOS apps. In that project, copy the example file before adding the
backend values:

```sh
cp local.example.properties local.properties
```

Edit `local.properties`:

```properties
SUPABASE_URL=<BACKEND_URL>
SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
TV_LOGIN_REDIRECT_BASE_URL=https://app.example.com/tv-login
AVATAR_PUBLIC_BASE_URL=<BACKEND_URL>/storage/v1/object/public/avatars
```

Replace `app.example.com` with the address of the hosted web app.
`TV_LOGIN_REDIRECT_BASE_URL` must point to that app's `/tv-login` page and use
the same backend. The avatar setting is optional because the app can derive it
from `SUPABASE_URL`. Set it explicitly if you want every TV build to use the
same value.

Build the browser app:

```sh
npm install
npm run build
```

The build writes these values to `dist/nuvio.env.js`. Deploy the entire `dist/`
directory, including that file.

Build packages for physical TVs from the same configured project:

```sh
npm run package:webos
npm run package:tizen
```

Both packages include the generated `nuvio.env.js` and use the configured
backend values when they start. Rebuild and reinstall each package after a
value changes.

To package Tizen with a properties file stored elsewhere, use:

```sh
npm run package:tizen -- --env-source /absolute/path/to/local.properties
```

## Verify the connection

Before testing your app, check the backend:

```sh
./nuvio doctor
```

In the rebuilt app, create or sign in to an account, create a profile, load the
avatars, and synchronize a change with another app. On NuvioTV, test direct
email and password sign-in. If a Web TV build has a matching `/tv-login` page,
test QR sign-in as well.
