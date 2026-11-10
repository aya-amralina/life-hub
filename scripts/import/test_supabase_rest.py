import io
import json
import unittest
import urllib.error

from supabase_rest import ConfigError, SupabaseError, SupabaseRest, config_from_env, key_headers, parse_env

SECRET = "sb_secret_TEST"
PUB = "sb_publishable_TEST"
URL = "https://abc.supabase.co"


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, status: int = 200, headers: dict | None = None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {}


class Recorder:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, req):
        self.requests.append(req)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


class EnvTest(unittest.TestCase):
    def test_parse_env(self):
        env = parse_env("# c\nA=1\nexport B='two'\nC=\"x=y\"\n\nbroken\n")
        self.assertEqual(env, {"A": "1", "B": "two", "C": "x=y"})

    def test_config_requires_new_secret_key(self):
        base = {"VITE_SUPABASE_URL": URL, "VITE_SUPABASE_PUBLISHABLE_KEY": PUB}
        with self.assertRaises(ConfigError):
            config_from_env({**base, "SUPABASE_SECRET_KEY": "eyJhbGciOi.legacy.jwt"})
        cfg = config_from_env({**base, "SUPABASE_SECRET_KEY": SECRET})
        self.assertEqual(cfg.secret_key, SECRET)

    def test_config_rejects_placeholder_url(self):
        with self.assertRaises(ConfigError):
            config_from_env({"VITE_SUPABASE_URL": "https://YOUR-PROJECT.supabase.co", "SUPABASE_SECRET_KEY": SECRET})

    def test_config_rejects_secret_in_vite_var(self):
        with self.assertRaises(ConfigError):
            config_from_env({"VITE_SUPABASE_URL": URL, "SUPABASE_SECRET_KEY": SECRET, "VITE_SUPABASE_PUBLISHABLE_KEY": SECRET})

    def test_config_rejects_legacy_publishable(self):
        with self.assertRaises(ConfigError):
            config_from_env({"VITE_SUPABASE_URL": URL, "SUPABASE_SECRET_KEY": SECRET, "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJ.anon.jwt"})


class HeadersTest(unittest.TestCase):
    def test_new_keys_go_only_in_apikey(self):
        for key in (SECRET, PUB):
            h = key_headers(key)
            self.assertEqual(h["apikey"], key)
            self.assertNotIn("Authorization", h)

    def test_rejects_legacy_jwt(self):
        with self.assertRaises(ConfigError):
            key_headers("eyJhbGciOiJIUzI1NiJ9.x.y")


class RestTest(unittest.TestCase):
    def test_request_headers_and_no_bearer(self):
        rec = Recorder([FakeResponse(b"[]")])
        status, data, _ = SupabaseRest(URL, SECRET, rec).request("GET", "/rest/v1/items", query={"select": "id"})
        req = rec.requests[0]
        self.assertEqual((status, data), (200, []))
        self.assertEqual(req.get_header("Apikey"), SECRET)
        self.assertIsNone(req.get_header("Authorization"))
        self.assertEqual(req.full_url, f"{URL}/rest/v1/items?select=id")

    def test_upsert_batches_and_prefer(self):
        rec = Recorder([FakeResponse(b""), FakeResponse(b"")])
        rows = [{"source_id": str(i)} for i in range(501)]
        SupabaseRest(URL, SECRET, rec).upsert("items", rows)
        self.assertEqual(len(rec.requests), 2)
        self.assertIn("on_conflict=user_id,source_id", rec.requests[0].full_url)
        self.assertEqual(rec.requests[0].get_header("Prefer"), "resolution=merge-duplicates,return=minimal")
        self.assertEqual(len(json.loads(rec.requests[1].data)), 1)

    def test_count_from_content_range(self):
        rec = Recorder([FakeResponse(b"", headers={"Content-Range": "0-0/254"})])
        self.assertEqual(SupabaseRest(URL, SECRET, rec).count("items"), 254)

    def test_find_user_id(self):
        body = json.dumps({"users": [{"id": "u1", "email": "Me@Example.com"}]}).encode()
        rec = Recorder([FakeResponse(body)])
        self.assertEqual(SupabaseRest(URL, SECRET, rec).find_user_id("me@example.com"), "u1")

    def test_errors_never_include_details(self):
        payload = {"code": "23514", "message": "violates check constraint", "details": "Failing row contains (PRIVATE)"}
        err = urllib.error.HTTPError(URL, 400, "Bad Request", {}, io.BytesIO(json.dumps(payload).encode()))
        rec = Recorder([err])
        with self.assertRaises(SupabaseError) as ctx:
            SupabaseRest(URL, SECRET, rec).request("POST", "/rest/v1/items", body=[{}])
        self.assertNotIn("PRIVATE", str(ctx.exception))
        self.assertIn("23514", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
