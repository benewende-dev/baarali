import hashlib
import importlib.util
import io
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("providers", Path(__file__).with_name("install-providers.py"))
providers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(providers)


class ProviderInstallation(unittest.TestCase):
    def test_checks_digest_before_admitting_an_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "download"
            source = {"url": "https://github.com/example/releases/file", "sha256": hashlib.sha256(b"expected").hexdigest()}
            with patch.object(providers.urllib.request, "urlopen", return_value=io.BytesIO(b"different")):
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    providers.download(source, target)

    def test_preserves_licenses_and_native_executable_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "provider.zip"
            with zipfile.ZipFile(archive, "w") as output:
                entry = zipfile.ZipInfo("ghidra/support/analyzeHeadless")
                entry.external_attr = (stat.S_IFREG | 0o755) << 16
                output.writestr(entry, "#!/bin/sh\n")
                output.writestr("ghidra/LICENSE", "license text")
            destination = Path(directory) / "output"
            providers.extract(archive, destination, "ghidra")
            self.assertEqual((destination / "LICENSE").read_text(), "license text")
            self.assertEqual((destination / "support/analyzeHeadless").stat().st_mode & 0o777, 0o755)

    def test_rejects_traversal_symlinks_and_unexpected_roots(self):
        for name, mode in [("ghidra/../escape", 0o644), ("/absolute", 0o644), ("other/file", 0o644), ("ghidra/link", stat.S_IFLNK | 0o777)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                archive = Path(directory) / "provider.zip"
                with zipfile.ZipFile(archive, "w") as output:
                    entry = zipfile.ZipInfo(name)
                    entry.external_attr = mode << 16
                    output.writestr(entry, "content")
                with self.assertRaises(ValueError):
                    providers.extract(archive, Path(directory) / "output", "ghidra")


if __name__ == "__main__":
    unittest.main()
