# Contributing

Open an issue for a bug or feature, or submit a focused pull request with a
description of the behavior and relevant checks. For substantial changes,
discuss the approach in an issue first.

Follow the [README](README.md) for setup. Keep credentials in ignored local
environment files. Use fictional profile data in fixtures and screenshots.
Include a Prisma migration when changing the database schema.

Run the checks relevant to your change:

```sh
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix frontend test -- --watch=false
python -m pip install -r assets/requirements.txt
python -m unittest discover -s assets/templates -p 'test_*.py' -v
```

Do not publish credentials or private user data in issues. Report vulnerabilities
through the repository's private vulnerability reporting form when available.

By submitting a contribution, you agree to license it under this project's MIT
license and confirm you have the right to contribute it.
