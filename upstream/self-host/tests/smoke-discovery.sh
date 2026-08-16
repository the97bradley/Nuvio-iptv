#!/bin/sh

set -eu

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

env_value() {
    grep "^$1=" .env | head -n 1 | cut -d= -f2-
}

public_url=$(env_value SUPABASE_PUBLIC_URL)
request_url=${DISCOVERY_TEST_URL:-${public_url%/}/.well-known/nuvio}
expected_key=$(env_value ANON_KEY)
configured_publishable_key=$(env_value SUPABASE_PUBLISHABLE_KEY 2>/dev/null || true)
configured_secret_key=$(env_value SUPABASE_SECRET_KEY 2>/dev/null || true)
response=$(mktemp)
headers=$(mktemp)

cleanup() {
    rm -f "$response" "$headers"
}
trap cleanup EXIT

if [ -n "$configured_publishable_key" ] && [ -n "$configured_secret_key" ]; then
    expected_key=$configured_publishable_key
fi

curl --fail-with-body -sS \
    -D "$headers" \
    -H "Origin: https://app.example.invalid" \
    "$request_url" \
    > "$response"

jq -e \
    --arg backend_url "$public_url" \
    --arg publishable_key "$expected_key" \
    '
        type == "object"
        and (keys | sort) == [
            "backend_url",
            "capabilities",
            "publishable_key",
            "self_hosted",
            "service",
            "version"
        ]
        and .version == 1
        and .service == "nuvio"
        and .self_hosted == true
        and .backend_url == $backend_url
        and .publishable_key == $publishable_key
        and .capabilities == {
            "email_password_auth": true,
            "tv_login": true
        }
    ' "$response" >/dev/null

tr -d '\r' < "$headers" | grep -Fqi 'content-type: application/json; charset=utf-8'
tr -d '\r' < "$headers" | grep -Fqi 'access-control-allow-origin: *'

post_status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    "$request_url")
[ "${post_status#2}" = "$post_status" ] || {
    echo "Discovery endpoint accepted POST with HTTP $post_status" >&2
    exit 1
}

echo "OK  unauthenticated backend discovery contract"
