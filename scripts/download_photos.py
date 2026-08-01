#!/usr/bin/env python3
"""
scripts/download_photos.py

Fixes the hotlinked-photo bug: data/people.json's photo_url fields point
directly at https://snfagora.jhu.edu/wp-content/uploads/... and that server
returns a real 403 Forbidden to every external hotlink request (verified via
`curl -I` against several sample URLs, and again via a headless Chromium
request — same 403, same Cloudflare "Attention Required" block page, so this
is not a client-header quirk). Every avatar on the dashboard is broken as a
result.

This script downloads each person's photo to images/people/<id>.jpg and
rewrites people.json's photo_url to that local relative path — so the site
serves its own copy instead of hotlinking a URL that 403s for any visitor's
browser too.

Usage:
    python3 scripts/download_photos.py

Idempotent / safe to re-run: a person whose photo_url already points at
images/people/... is left alone (skipped, not re-downloaded), and a fresh
run only touches people whose photo_url is still an external http(s) URL.

Contract:
    - Reads data/people.json (a list of person records — id, name,
      photo_url, plus the rest of the export contract; see README.md's JS
      helper contract for the shape avatarHtml() expects).
    - For every record with a non-null photo_url that is still an external
      URL: attempts a download to images/people/<id>.<ext>.
        - On success: rewrites that record's photo_url to the local
          relative path ("images/people/<id>.jpg").
        - On failure (HTTP error, network error, empty/invalid body):
          logs the failure and sets photo_url to null — never leaves a
          value already confirmed broken, since js/utils.js's avatarHtml()
          renders a clean initials-tile fallback for null and nothing else
          (a non-null-but-dead URL would render a broken-image icon
          instead of that fallback).
    - Writes people.json back with the same pretty-printed (indent=2)
      formatting the file already uses, plus a trailing newline, so the
      diff is limited to the photo_url values that actually changed.
"""

import json
import os
import sys
import urllib.error
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEOPLE_JSON = os.path.join(REPO_ROOT, "data", "people.json")
IMAGES_DIR = os.path.join(REPO_ROOT, "images", "people")
LOCAL_PREFIX = "images/people/"

# A realistic browser UA/Accept set. Doesn't change the outcome against a
# domain-wide Cloudflare block (verified: even a full headless Chromium
# session gets the same 403 challenge page), but it's the correct, honest
# request shape to send regardless, and costs nothing.
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}

TIMEOUT_SECS = 20


def guess_extension(url, content_type=None):
    """Prefer the URL's own extension; fall back to content-type; default .jpg."""
    path = url.split("?", 1)[0]
    _, ext = os.path.splitext(path)
    if ext and len(ext) <= 5:
        return ext.lower()
    if content_type:
        if "png" in content_type:
            return ".png"
        if "webp" in content_type:
            return ".webp"
        if "gif" in content_type:
            return ".gif"
    return ".jpg"


def download_one(person_id, url):
    """
    Attempt to download `url` to images/people/<person_id><ext>.
    Returns the local relative path on success, or None on failure (with
    the reason printed to stderr — never raises, so one bad photo never
    aborts the whole run).
    """
    req = urllib.request.Request(url, headers=REQUEST_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
            content_type = resp.headers.get("Content-Type", "")
            body = resp.read()
    except urllib.error.HTTPError as e:
        print(f"  FAIL {person_id}: HTTP {e.code} for {url}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"  FAIL {person_id}: {e.reason} for {url}", file=sys.stderr)
        return None
    except Exception as e:  # noqa: BLE001 - one bad photo must not crash the run
        print(f"  FAIL {person_id}: {e} for {url}", file=sys.stderr)
        return None

    if not body:
        print(f"  FAIL {person_id}: empty response body for {url}", file=sys.stderr)
        return None

    ext = guess_extension(url, content_type)
    filename = f"{person_id}{ext}"
    local_path = os.path.join(IMAGES_DIR, filename)
    with open(local_path, "wb") as f:
        f.write(body)

    print(f"  OK   {person_id} -> images/people/{filename} ({len(body)} bytes)")
    return f"{LOCAL_PREFIX}{filename}"


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    with open(PEOPLE_JSON, "r", encoding="utf-8") as f:
        people = json.load(f)

    succeeded = 0
    failed = 0
    skipped_already_local = 0
    skipped_null = 0

    for person in people:
        photo_url = person.get("photo_url")
        person_id = person.get("id", "<unknown>")

        if not photo_url:
            skipped_null += 1
            continue

        if photo_url.startswith(LOCAL_PREFIX):
            # Already fixed by a previous run of this script.
            skipped_already_local += 1
            continue

        local_path = download_one(person_id, photo_url)
        if local_path:
            person["photo_url"] = local_path
            succeeded += 1
        else:
            # Confirmed broken (this run just tried it and it failed) —
            # never silently leave a value known to be dead. avatarHtml()
            # in js/utils.js already renders a clean initials tile for
            # null, so this degrades gracefully rather than showing a
            # broken-image icon.
            person["photo_url"] = None
            failed += 1

    with open(PEOPLE_JSON, "w", encoding="utf-8") as f:
        json.dump(people, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print()
    print(f"Downloaded:            {succeeded}")
    print(f"Failed (set to null):  {failed}")
    print(f"Already local (kept):  {skipped_already_local}")
    print(f"No photo_url (kept):   {skipped_null}")
    print(f"Total records:         {len(people)}")


if __name__ == "__main__":
    main()
