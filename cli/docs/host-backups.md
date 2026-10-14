# Portable host backups

`cadet backup <name>` and pre-upgrade backups on local or Docker hosts export
portable `.vbundle` files directly from host-owned state, without a guardian
token. Services pause briefly while their workspace and encrypted credential
store are copied, then resume before compression. Bundles retain credentials
and use owner-only file permissions. Cloud-managed backups use cloud session
authentication. Other remote connections still use the authenticated runtime
export endpoint.
