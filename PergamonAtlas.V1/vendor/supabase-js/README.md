# supabase-js (pinned copy)

Served from this site instead of a floating CDN tag, so admin sessions never
run a library version nobody has tested.

| Version | File | Source | Verified |
|---|---|---|---|
| 2.118.0 | `2.118.0/supabase.js` (UMD build, 218,252 bytes) | npm tarball `@supabase/supabase-js@2.118.0`, `package/dist/umd/supabase.js` | tarball SHA-512 matches npm's published integrity `sha512-FxI8UXMVC2UG7IkeiI8fuQZqq2oI3JeSuN8MPIC2RLVaoEAxKS0nqE6kii9Ewpq8f9gNPM6git1Y8f0vN/QLFw==` |

Pages load it with Subresource Integrity:

```html
<script src="/vendor/supabase-js/2.118.0/supabase.js"
        integrity="sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK"></script>
```

## Upgrading

1. Pick a release at least two weeks old; read its changelog.
2. `npm pack @supabase/supabase-js@<version>` and check the tarball's SHA-512
   against `npm view @supabase/supabase-js@<version> dist.integrity`.
3. Copy `package/dist/umd/supabase.js` (and `LICENSE`) to `<version>/`.
4. Compute `sha384` of the file (base64) and update every page's `src` and
   `integrity` (search the site for `/vendor/supabase-js/`).
5. Run the regression suite; keep the old folder until the new one is live.

The Edge Function imports the same version (`npm:@supabase/supabase-js@2.118.0`).
